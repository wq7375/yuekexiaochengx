// 云函数：manageSchedule
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 使用当前环境
})

const db = cloud.database()
const _ = db.command

// 辅助函数（与前端相同的日期处理逻辑）
function pad(n) { return String(n).padStart(2, '0') }
function formatDateLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
function parseDateLocal(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m-1, d, 0, 0, 0, 0)
}
function addDaysLocal(d, days) {
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  dd.setDate(dd.getDate() + days)
  return dd
}
function startOfWeekMonday(baseDate, offsetDays = 0) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
  let wd = d.getDay()
  if (wd === 0) wd = 7
  d.setDate(d.getDate() - wd + 1 + offsetDays)
  return d
}
function getWeekStartStrings(weekOffset = 0) {
  const mondayDate = startOfWeekMonday(new Date(), weekOffset)
  const mondayStr = formatDateLocal(mondayDate)
  const sundayAnchorStr = formatDateLocal(addDaysLocal(mondayDate, -1))
  const weekEndStr = formatDateLocal(addDaysLocal(mondayDate, 6))
  return { mondayDate, mondayStr, sundayAnchorStr, weekEndStr }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { operation, data } = event
  
  try {
    console.log('执行操作:', operation, 'OpenID:', wxContext.OPENID);
    
    // 直接查询people集合检查权限，避免云函数调用云函数
    const userRes = await db.collection('people')
      .where({
        _openid: wxContext.OPENID
      })
      .get()
    
    if (userRes.data.length === 0) {
      return { success: false, message: '用户未注册' }
    }
    
    const userInfo = userRes.data[0]
    // 根据role字段判断是否为管理员
    if (userInfo.role !== 'admin') {
      return { success: false, message: '无管理员权限' }
    }
    
    // 根据操作类型执行不同逻辑
    switch (operation) {
      case 'getSchedule':
        return await getSchedule(data)
      case 'saveSchedule':
        return await saveSchedule(data)
      case 'deleteLesson':
        return await deleteLesson(data)
      case 'copyLastWeek':
        return await copyLastWeek(data)
      default:
        return { success: false, message: '未知操作类型' }
    }
  } catch (err) {
    console.error('课表管理操作失败:', err)
    return { success: false, message: '操作失败: ' + err.message }
  }
}

// 获取课表
async function getSchedule(data) {
  const { weekOffset = 0 } = data
  const { mondayStr, sundayAnchorStr, weekEndStr } = getWeekStartStrings(weekOffset)
  
  const res = await db.collection('schedules')
    .where({ weekStart: _.in([mondayStr, sundayAnchorStr]) })
    .limit(1)
    .get()
  
  if (res.data.length === 0) {
    // 没有文档：生成7天空壳
    const { mondayDate } = getWeekStartStrings(weekOffset)
    const courses = []
    for (let i = 0; i < 7; i++) {
      const date = formatDateLocal(addDaysLocal(mondayDate, i))
      courses.push({ date, type: 'group', lessons: [] })
      courses.push({ date, type: 'private', lessons: [] })
    }
    
    return { 
      success: true, 
      data: { 
        weekStart: mondayStr,
        courses,
        selectedDate: mondayStr,
        selectedType: 'group'
      } 
    }
  }
  
  // 处理现有课表数据
  let doc = res.data[0]
  let courses = Array.isArray(doc.courses) ? doc.courses : []
  
  // 过滤非本周数据
  const startTs = parseDateLocal(mondayStr).getTime()
  const endTs = parseDateLocal(weekEndStr).getTime()
  courses = courses.filter(c => {
    if (!c || !c.date) return false
    const ts = parseDateLocal(c.date).getTime()
    return ts >= startTs && ts <= endTs
  })
  
  // 补齐缺失的日期和类型
  const { mondayDate } = getWeekStartStrings(weekOffset)
  const wantDates = [...Array(7)].map((_, i) => formatDateLocal(addDaysLocal(mondayDate, i)))
  const wantTypes = ['group', 'private']
  
  for (const dateStr of wantDates) {
    for (const tp of wantTypes) {
      const idx = courses.findIndex(x => x.date === dateStr && x.type === tp)
      if (idx === -1) {
        courses.push({ date: dateStr, type: tp, lessons: [] })
      }
    }
  }
  
  // 排序
  courses.sort((a, b) => {
    const ta = parseDateLocal(a.date).getTime()
    const tb = parseDateLocal(b.date).getTime()
    if (ta !== tb) return ta - tb
    const rank = t => (t === 'group' ? 0 : 1)
    return rank(a.type) - rank(b.type)
  })
  
  return { 
    success: true, 
    data: { 
      weekStart: doc.weekStart,
      courses,
      selectedDate: mondayStr,
      selectedType: 'group'
    } 
  }
}

// 保存课表
async function saveSchedule(data) {
  const { weekStart, courses } = data
  const { sundayAnchorStr } = getWeekStartStrings(0)
  
  // 查找现有文档
  const res = await db.collection('schedules')
    .where({ weekStart: _.in([weekStart, sundayAnchorStr]) })
    .limit(1)
    .get()
  
  if (res.data.length > 0) {
    // 更新现有文档
    await db.collection('schedules').doc(res.data[0]._id).update({
      data: { courses }
    })
    return { success: true, message: '课表已更新' }
  } else {
    // 创建新文档
    await db.collection('schedules').add({
      data: { weekStart, courses }
    })
    return { success: true, message: '课表已创建' }
  }
}

// 删除课程
async function deleteLesson(data) {
  const { weekStart, date, type, lessonIndex } = data
  
  // 查找文档
  const { sundayAnchorStr } = getWeekStartStrings(0)
  const res = await db.collection('schedules')
    .where({ weekStart: _.in([weekStart, sundayAnchorStr]) })
    .limit(1)
    .get()
  
  if (res.data.length === 0) {
    return { success: false, message: '未找到课表' }
  }
  
  const doc = res.data[0]
  const courses = doc.courses || []
  const courseIndex = courses.findIndex(c => c.date === date && c.type === type)
  
  if (courseIndex === -1) {
    return { success: false, message: '未找到对应课程' }
  }
  
  // 删除指定课程
  if (courses[courseIndex].lessons && courses[courseIndex].lessons.length > lessonIndex) {
    courses[courseIndex].lessons.splice(lessonIndex, 1)
  } else {
    return { success: false, message: '课程索引错误' }
  }
  
  // 更新数据库
  await db.collection('schedules').doc(doc._id).update({
    data: { courses }
  })
  
  return { success: true, message: '课程已删除' }
}

// 复制上周课表
async function copyLastWeek(data) {
  const { weekOffset } = data
  const { mondayStr: targetWeekStart } = getWeekStartStrings(weekOffset)
  const { mondayStr: lastWeekStart, sundayAnchorStr: lastWeekSundayAnchor } = getWeekStartStrings(weekOffset - 7)
  
  // 获取上周课表
  const res = await db.collection('schedules')
    .where({ weekStart: _.in([lastWeekStart, lastWeekSundayAnchor]) })
    .limit(1)
    .get()
  
  if (res.data.length === 0) {
    return { success: false, message: '上周课表不存在' }
  }
  
  // 处理课程数据
  const { mondayDate: targetMonday, mondayStr: targetMondayStr, weekEndStr: targetWeekEndStr } = getWeekStartStrings(weekOffset)
  const startTs = parseDateLocal(targetMondayStr).getTime()
  const endTs = parseDateLocal(targetWeekEndStr).getTime()
  
  let oldCourses = JSON.parse(JSON.stringify(res.data[0].courses || []))
  oldCourses = oldCourses.filter(c => {
    if (!c || !c.date) return false
    const ts = parseDateLocal(c.date).getTime()
    const dayIdx = new Date(parseDateLocal(c.date)).getDay() || 7
    const mappedDate = formatDateLocal(addDaysLocal(targetMonday, dayIdx - 1))
    c.date = mappedDate
    return true
  })
  
  // 清空预约信息
  oldCourses.forEach(c => {
    (c.lessons || []).forEach(l => {
      l.bookedCount = 0
      l.students = []
    })
  })
  
  // 补齐缺失的日期和类型
  const dates = [...Array(7)].map((_, i) => formatDateLocal(addDaysLocal(targetMonday, i)))
  const tps = ['group', 'private']
  for (const d of dates) {
    for (const tp of tps) {
      if (!oldCourses.find(x => x.date === d && x.type === tp)) {
        oldCourses.push({ date: d, type: tp, lessons: [] })
      }
    }
  }
  
  // 排序
  oldCourses.sort((a, b) => {
    const ta = parseDateLocal(a.date).getTime()
    const tb = parseDateLocal(b.date).getTime()
    if (ta !== tb) return ta - tb
    const rank = t => (t === 'group' ? 0 : 1)
    return rank(a.type) - rank(b.type)
  })
  
  return { 
    success: true, 
    data: {
      courses: oldCourses,
      selectedDate: targetMondayStr,
      selectedType: 'group'
    },
    message: '已复制上周课表'
  }
}
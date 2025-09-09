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

    // 直接查询people集合检查权限，避免云函数调用云函数（血的教训）
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
// 在manageSchedule.js中修改getSchedule方法，添加详细日志
async function getSchedule(data) {
  const { weekOffset = 0 } = data;
  const { mondayStr, sundayAnchorStr, weekEndStr } = getWeekStartStrings(weekOffset);
  
  console.log('获取课表参数:', { weekOffset, mondayStr, sundayAnchorStr, weekEndStr });
  
  // 查询课表
  const res = await db.collection('schedules')
    .where({ weekStart: _.in([mondayStr, sundayAnchorStr]) })
    .limit(1)
    .get();
  
  console.log('数据库查询结果:', res);
  
  if (res.data.length === 0) {
    console.log('未找到课表文档，生成空课表');
    // 没有文档：生成7天空壳
    const { mondayDate } = getWeekStartStrings(weekOffset);
    const courses = []
    for (let i = 0; i < 7; i++) {
      const date = formatDateLocal(addDaysLocal(mondayDate, i))
      courses.push({ date, type: 'group', lessons: {numOfLessonsAdded:0} })
      courses.push({ date, type: 'private', lessons: {numOfLessonsAdded:0} })
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
  let doc = res.data[0];
  console.log('找到课表文档:', doc);
  
  let courses = Array.isArray(doc.courses) ? doc.courses : [];
  console.log('原始课程数据:', courses);
  
  // 过滤非本周数据
  const startTs = parseDateLocal(mondayStr).getTime();
  const endTs = parseDateLocal(weekEndStr).getTime();
  courses = courses.filter(c => {
    if (!c || !c.date) return false;
    const ts = parseDateLocal(c.date).getTime();
    return ts >= startTs && ts <= endTs;
  });
  
  console.log('过滤后的课程数据:', courses);
  
  // 补齐缺失的日期和类型
  const { mondayDate } = getWeekStartStrings(weekOffset);
  const wantDates = [...Array(7)].map((_, i) => formatDateLocal(addDaysLocal(mondayDate, i)));
  const wantTypes = ['group', 'private'];
  
  for (const dateStr of wantDates) {
    for (const tp of wantTypes) {
      const idx = courses.findIndex(x => x.date === dateStr && x.type === tp);
      if (idx === -1) {
        courses.push({ date: dateStr, type: tp, lessons: {numOfLessonsAdded: 0} });
      }
    }
  }
  
  // 排序
  courses.sort((a, b) => {
    const ta = parseDateLocal(a.date).getTime();
    const tb = parseDateLocal(b.date).getTime();
    if (ta !== tb) return ta - tb;
    const rank = t => (t === 'group' ? 0 : 1);
    return rank(a.type) - rank(b.type);
  });
  
  console.log('最终课程数据:', courses);
  
  return { 
    success: true, 
    data: { 
      weekStart: doc.weekStart,
      courses,
      selectedDate: mondayStr,
      selectedType: 'group'
    } 
  };
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
  
  // 获取课程信息
  const course = courses[courseIndex]
  const lessonsObj = course.lessons || {}
  
  // 检查课程是否存在
  if (!lessonsObj.hasOwnProperty(lessonIndex) || lessonIndex === "numOfLessonsAdded") {
    return { success: false, message: '课程ID不存在' }
  }
  
  const lesson = lessonsObj[lessonIndex]
  
  // 检查课程是否已经开始
  const now = new Date()
  let hasStarted = false
  
  // 如果有开始时间，则判断课程是否已经开始
  if (lesson.startTime) {
    try {
      // 解析课程日期和时间
      const [year, month, day] = date.split('-').map(Number)
      const [hours, minutes] = lesson.startTime.split(':').map(Number)
      const courseDateTime = new Date(year, month - 1, day, hours, minutes)
      
      hasStarted = now > courseDateTime
    } catch (err) {
      console.error('解析课程时间出错:', err)
      // 如果时间格式有问题，默认认为课程已开始
      hasStarted = true
    }
  } else {
    // 如果没有开始时间，使用日期判断（只比较日期部分）
    const courseDate = new Date(date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    hasStarted = courseDate < today
  }
  
  // 处理相关预约
  if (!hasStarted) {
    try {
      // 查找所有相关预约
      const bookingRes = await db.collection('booking')
        .where({
          weekStart: _.in([weekStart, sundayAnchorStr]),
          courseDate: date,
          courseType: type,
          lessonIndex: lessonIndex,
          status: 1 // 只处理有效预约
        })
        .get()
      
      console.log(`找到 ${bookingRes.data.length} 条相关预约记录`)
      
      // 对每个预约调用reserveClass强制取消
      for (const booking of bookingRes.data) {
        try {
          await cloud.callFunction({
            name: 'reserveClass',
            data: {
              action: 'forceCancel',
              studentId: booking.studentId,
              cardLabel: booking.cardLabel,
              weekStart: booking.weekStart,
              date: booking.courseDate,
              type: booking.courseType,
              lessonIndex: booking.lessonIndex,
              isForce: true
            }
          })
          console.log(`成功取消预约: ${booking.studentId}`)
        } catch (err) {
          console.error(`取消预约失败 (${booking.studentId}):`, err)
          // 即使取消预约失败，也继续处理下一个
        }
      }
    } catch (err) {
      console.error('查询预约时出错:', err)
      // 即使取消预约失败，也继续删除课程
    }
  } else {
    console.log('课程已开始，保留预约记录')
  }
  
  // 删除指定课程
  delete lessonsObj[lessonIndex]
  
  // 更新数据库
  await db.collection('schedules').doc(doc._id).update({
    data: { courses }
  })
  
  return { 
    success: true, 
    message: hasStarted ? 
      '课程已删除（已开始课程，保留预约记录）' : 
      '课程已删除，相关预约已取消并退还次数' 
  }
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
    // 遍历oldCourses数组中的每一个课程项(c)
    const lessonsObj = c.lessons || {};
    
    for (const lessonId in lessonsObj) {
      // 排除特殊的numOfLessonsAdded属性和原型链上的属性
      if (lessonId === 'numOfLessonsAdded' || !lessonsObj.hasOwnProperty(lessonId)) continue;
      
      const lesson = lessonsObj[lessonId];
      lesson.bookedCount = 0; // 将当前课程的已预约人数重置为0
      lesson.students = []; // 将当前课程的学生列表清空
    }
  });
  
  // 补齐缺失的日期和类型
  const dates = [...Array(7)].map((_, i) => formatDateLocal(addDaysLocal(targetMonday, i)))
  const tps = ['group', 'private']
  for (const d of dates) {
    for (const tp of tps) {
      if (!oldCourses.find(x => x.date === d && x.type === tp)) {
        oldCourses.push({ date: d, type: tp, lessons: {numOfLessonsAdded: 0,} })
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
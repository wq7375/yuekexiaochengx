const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function parseDateLocal(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function formatDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysLocal(d, days) {
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  dd.setDate(dd.getDate() + days)
  return dd
}

exports.main = async (event, context) => {
  const { weekStart, date, type, lessonIndex } = event
  if (!weekStart || !date || !type || lessonIndex === undefined) {
    return { success: false, message: '缺少必要参数' }
  }

  try {
    const sundayAnchorStr = formatDateLocal(addDaysLocal(parseDateLocal(weekStart), -1))

    const res = await db.collection('schedules')
      .where({ weekStart: _.in([weekStart, sundayAnchorStr]) })
      .limit(1)
      .get()

    if (!res.data.length) {
      return { success: false, message: '未找到对应周的课表' }
    }

    const doc = res.data[0]
    const courses = doc.courses || []

    // 调试输出，看看实际存的日期和类型
    console.log('传入 date:', date, 'type:', type)
    console.log('数据库 courses:', courses.map(c => ({
      date: c.date instanceof Date ? formatDateLocal(c.date) : c.date,
      type: c.type
    })))

    // 格式化传入的 date 和 type
    const targetDate = formatDateLocal(
      date instanceof Date ? date : parseDateLocal(date)
    )
    const targetType = String(type).trim().toLowerCase()

    const courseIdx = courses.findIndex(c => {
      const cDate = c.date instanceof Date ? formatDateLocal(c.date) : String(c.date).trim()
      const cType = String(c.type).trim().toLowerCase()
      return cDate === targetDate && cType === targetType
    })

    if (courseIdx === -1) {
      return { success: false, message: '未找到对应日期/类型' }
    }

    if (lessonIndex < 0 || lessonIndex >= courses[courseIdx].lessons.length) {
      return { success: false, message: '课程索引无效' }
    }

    courses[courseIdx].lessons.splice(lessonIndex, 1)

    await db.collection('schedules').doc(doc._id).update({
      data: { courses }
    })

    return { success: true, message: '课程删除成功' }

  } catch (err) {
    console.error('删除课程失败', err)
    return { success: false, message: '服务器错误', error: err }
  }
}

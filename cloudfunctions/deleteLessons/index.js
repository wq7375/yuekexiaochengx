// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()
const _ = db.command

/**
 * event 参数：
 *   weekStart: String  // 这一周的起始日期
 *   date: String       // 要删除课程的日期
 *   type: String       // 课程类型（group/private等）
 *   lessonIndex: Number // lessons 数组中的索引
 */
exports.main = async (event, context) => {
  const { weekStart, date, type, lessonIndex } = event

  try {
    // 找到这一周的课表
    const res = await db.collection('schedules')
      .where({ weekStart })
      .limit(1)
      .get()

    if (!res.data.length) {
      return { success: false, message: '未找到课表' }
    }

    const schedule = res.data[0]
    const courses = schedule.courses || []

    // 找到对应日期和类型的课程
    const idx = courses.findIndex(c => c.date === date && c.type === type)
    if (idx === -1) {
      return { success: false, message: '未找到对应日期/类型' }
    }

    // 删除指定课程
    if (lessonIndex >= 0 && lessonIndex < courses[idx].lessons.length) {
      courses[idx].lessons.splice(lessonIndex, 1)
    } else {
      return { success: false, message: '课程索引无效' }
    }

    // 更新数据库
    await db.collection('schedules').doc(schedule._id).update({
      data: { courses }
    })

    return { success: true, message: '删除成功' }
  } catch (err) {
    return { success: false, message: err.message }
  }
}

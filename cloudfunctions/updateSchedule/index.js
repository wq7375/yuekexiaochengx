const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * params:
 * - weekStart: string
 * - type: 'group' | 'private'
 * - date: string
 * - lessonIndex: string (课程ID)
 * - action: 'book' | 'forceBook' | 'cancel' | 'forceCancel'
 * - student: { studentId, name } (但不再使用，仅保留用于兼容性)
 */
exports.main = async (event, context) => {
  const { weekStart, type, date, lessonIndex, action } = event // 不再需要student参数，但为兼容性保留
  const db = cloud.database()

  // 查询本周课表
  const res = await db.collection('schedules').where({ weekStart }).get()
  if (!res.data.length) return { success: false, msg: '课表不存在' }
  const doc = res.data[0]
  const courses = doc.courses

  // 找到对应课程和课时
  const courseIdx = courses.findIndex(c => c.type == type && c.date == date)
  if (courseIdx === -1) return { success: false, msg: '当天无课' }
  
  const lessonsObj = courses[courseIdx].lessons
  // 检查课程ID是否存在
  if (!lessonsObj || !lessonsObj.hasOwnProperty(lessonIndex)) {
    return { success: false, msg: '课时不存在' }
  }
  const lesson = lessonsObj[lessonIndex]

  // 操作逻辑
  const isForce = action.includes('force')
  
  if (action === 'book' || action === 'forceBook') {
    // 非强制预约时检查人数限制
    if (!isForce && lesson.bookedCount >= lesson.maxCount) {
      return { success: false, msg: '已约满' }
    }
    lesson.bookedCount += 1
  } else if (action === 'cancel' || action === 'forceCancel') {
    lesson.bookedCount -= 1
    if (lesson.bookedCount < 0) lesson.bookedCount = 0
  } else {
    return { success: false, msg: '无效的操作类型' }
  }

  // 更新 - 只更新bookedCount
  courses[courseIdx].lessons[lessonIndex] = lesson
  await db.collection('schedules').doc(doc._id).update({ data: { courses } })
  return { success: true }
}
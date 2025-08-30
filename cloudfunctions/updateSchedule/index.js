const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * params:
 * - weekStart: string
 * - type: 'group' | 'private'
 * - date: string
 * - lessonIndex: number
 * - action: 'book' | 'cancel' | 'forceCancel'
 * - student: { studentId, name }
 */
exports.main = async (event, context) => {
  const { weekStart, type, date, lessonIndex, action, student } = event
  const db = cloud.database()

  // 查询本周课表
  const res = await db.collection('schedules').where({ weekStart }).get()
  if (!res.data.length) return { success: false, msg: '课表不存在' }
  const doc = res.data[0]
  const courses = doc.courses

  // 找到对应课程和课时
  const courseIdx = courses.findIndex(c => c.type == type && c.date == date)
  if (courseIdx === -1) return { success: false, msg: '当天无课' }
  const lessons = courses[courseIdx].lessons
  if (lessonIndex < 0 || lessonIndex >= lessons.length) return { success: false, msg: '课时不存在' }
  const lesson = lessons[lessonIndex]

  // 操作逻辑
  if (action === 'book') {
    if (lesson.bookedCount >= lesson.maxCount)
      return { success: false, msg: '已约满' }
    if (lesson.students && lesson.students.find(s => s.studentId === student.studentId))
      return { success: false, msg: '已预约' }
    lesson.bookedCount += 1
    lesson.students = lesson.students || []
    lesson.students.push(student)
  } else if (action === 'cancel' || action === 'forceCancel') {
    const idx = lesson.students ? lesson.students.findIndex(s => s.studentId === student.studentId) : -1
    if (idx === -1)
      return { success: false, msg: '未预约' }
    lesson.students.splice(idx, 1)
    lesson.bookedCount -= 1
    if (lesson.bookedCount < 0) lesson.bookedCount = 0
  }

  // 更新
  courses[courseIdx].lessons = lessons
  await db.collection('schedules').doc(doc._id).update({ data: { courses } })
  return { success: true }
}
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * params:
 * - weekStart: string
 * - type: 'group' | 'private'
 * - date: string
 * - lessonIndex: string (现在是课程ID，不是数组索引)
 * - action: 'book' | 'forceBook' | 'cancel' | 'forceCancel'
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
  
  const lessonsObj = courses[courseIdx].lessons
  // 检查课程ID是否存在
  if (!lessonsObj || !lessonsObj.hasOwnProperty(lessonIndex)) {
    return { success: false, msg: '课时不存在' }
  }
  const lesson = lessonsObj[lessonIndex]

  // 操作逻辑
  const isForce = action.includes('force')
  
  // 预约时写入学生信息
  if (action === 'book' || action === 'forceBook') {
    // 检查是否已预约
    if (lesson.students && lesson.students.find(s => s.studentId === student.studentId)) {
      return { success: false, msg: '已预约' }
    }
    
    // 非强制预约时检查人数限制
    if (!isForce && lesson.bookedCount >= lesson.maxCount) {
      return { success: false, msg: '已约满' }
    }
    
    lesson.bookedCount += 1
    lesson.students = lesson.students || []
    lesson.students.push(student)
  } else if (action === 'cancel' || action === 'forceCancel') {
    const idx = lesson.students ? lesson.students.findIndex(s => s.studentId === student.studentId) : -1
    if (idx === -1) {
      return { success: false, msg: '未预约' }
    }
    lesson.students.splice(idx, 1)
    lesson.bookedCount -= 1
    if (lesson.bookedCount < 0) lesson.bookedCount = 0
  } else {
    // 处理无效的action值
    return { success: false, msg: '无效的操作类型' }
  }

  // 更新 - 直接更新对象中的特定课程
  courses[courseIdx].lessons[lessonIndex] = lesson
  await db.collection('schedules').doc(doc._id).update({ data: { courses } })
  return { success: true }
}
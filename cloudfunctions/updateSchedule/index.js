const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { weekStart, type, date, lessonIndex, action, student } = event
  const db = cloud.database()
  const _ = db.command

  console.log('updateSchedule 接收到参数:', event)

  // 查询本周课表
  const res = await db.collection('schedules').where({ weekStart }).get()
  if (!res.data.length) {
    console.log('课表不存在，weekStart:', weekStart)
    return { success: false, msg: '课表不存在' }
  }
  
  const doc = res.data[0]
  console.log('找到课表文档:', doc._id)
  
  // 深拷贝courses数组
  const courses = JSON.parse(JSON.stringify(doc.courses))
  console.log('课程数量:', courses.length)

  // 找到对应课程和课时
  const courseIdx = courses.findIndex(c => c.type == type && c.date == date)
  if (courseIdx === -1) {
    console.log('当天无课，date:', date, 'type:', type)
    return { success: false, msg: '当天无课' }
  }
  
  const lessonsObj = courses[courseIdx].lessons
  // 检查课程ID是否存在
  if (!lessonsObj || !lessonsObj.hasOwnProperty(lessonIndex)) {
    console.log('课时不存在，lessonIndex:', lessonIndex)
    return { success: false, msg: '课时不存在' }
  }
  
  const lesson = lessonsObj[lessonIndex]
  console.log('找到课时，原学生列表:', lesson.students)
  
  // 确保students数组存在
  if (!lesson.students) {
    lesson.students = []
    console.log('初始化空学生列表')
  }

  // 操作逻辑
  const isForce = action.includes('force')
  
  if (action === 'book' || action === 'forceBook') {
    // 非强制预约时检查人数限制
    if (!isForce && lesson.bookedCount >= lesson.maxCount) {
      console.log('课程已约满')
      return { success: false, msg: '已约满' }
    }
    
    // 检查学生是否已预约
    const existingStudentIndex = lesson.students.findIndex(s => s.studentId === student.studentId)
    if (existingStudentIndex >= 0) {
      console.log('学生已预约:', student.studentId)
      return { success: false, msg: '该学生已预约此课程' }
    }
    
    // 增加预约人数
    lesson.bookedCount += 1
    
    // 添加学生到学生列表
    lesson.students.push({
      studentId: student.studentId,
      name: student.name,
      cardLabel: student.cardLabel
    })
    
    console.log('添加学生后学生列表:', lesson.students)
  // 在updateSchedule云函数中修改取消逻辑
} else if (action === 'cancel' || action === 'forceCancel') {
  // 减少预约人数
  lesson.bookedCount -= 1
  if (lesson.bookedCount < 0) lesson.bookedCount = 0
  
  // 从学生列表中移除学生
  if (student && student.studentId) {
    const studentIndex = lesson.students.findIndex(s => s.studentId === student.studentId)
    if (studentIndex >= 0) {
      lesson.students.splice(studentIndex, 1)
      console.log('移除学生后学生列表:', lesson.students)
    } else {
      console.log('未找到要移除的学生:', student.studentId)
      // 即使没有找到学生，也继续执行（适用于强制取消）
      if (isForce) {
        console.log('强制取消：继续执行即使未找到学生')
      }
    }
  } else {
    console.log('学生信息不完整，无法移除')
    // 即使学生信息不完整，也继续执行（适用于强制取消）
    if (isForce) {
      console.log('强制取消：继续执行即使学生信息不完整')
    }
  }
}
  // 更新整个courses数组
  try {
    await db.collection('schedules').doc(doc._id).update({ 
      data: { 
        courses: courses
      } 
    })
    console.log('更新数据库成功')
  } catch (error) {
    console.error('更新数据库失败:', error)
    return { success: false, msg: '更新数据库失败' }
  }
  
  return { success: true }
}
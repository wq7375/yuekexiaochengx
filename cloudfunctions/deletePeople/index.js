const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { id } = event
  
  try {
    // 获取当前用户OpenID
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    // 验证当前用户是否是管理员
    const user = await db.collection('people').where({
      _openid: openid,
      role: 'admin'
    }).get()
    
    if (user.data.length === 0) {
      return { success: false, error: '无权限操作' }
    }
    
    // 1. 获取学生的所有选课记录
    const bookings = await db.collection('booking').where({
      studentId: id
    }).get()
    
    console.log('找到选课记录:', bookings.data.length, '条')
    
    // 2. 遍历每条选课记录，更新相关数据
    for (const booking of bookings.data) {
      console.log('处理选课记录:', booking._id, '课程日期:', booking.courseDate, '课节索引:', booking.lessonIndex)
      
      try {
        // 查询包含指定日期的schedule记录
        const schedules = await db.collection('schedules').where({
          'courses.date': booking.courseDate
        }).get()
        
        console.log('查询到的课程安排数量:', schedules.data.length)
        
        if (schedules.data.length > 0) {
          const schedule = schedules.data[0]
          console.log('找到课程安排文档:', schedule._id)
          
          // 调试：输出整个schedule文档结构
          console.log('Schedule文档结构:', JSON.stringify(schedule).substring(0, 500) + '...')
          
          // 找到对应的课程日期
          let courseIndex = -1
          let targetCourse = null
          
          for (let i = 0; i < schedule.courses.length; i++) {
            if (schedule.courses[i].date === booking.courseDate) {
              courseIndex = i
              targetCourse = schedule.courses[i]
              break
            }
          }
          
          if (courseIndex === -1) {
            console.log('未找到日期为', booking.courseDate, '的课程')
            // 输出所有可用的课程日期
            const availableDates = schedule.courses.map(c => c.date)
            console.log('可用课程日期:', availableDates)
            continue
          }
          
          console.log('找到课程索引:', courseIndex, '课程类型:', targetCourse.type)
          
          // 找到对应的课节 - 使用字符串形式的索引
          const lessonKey = booking.lessonIndex.toString()
          console.log('尝试访问课节:', lessonKey)
          
          if (targetCourse.lessons && targetCourse.lessons[lessonKey]) {
            const lesson = targetCourse.lessons[lessonKey]
            console.log('找到课节:', lessonKey, '学生数量:', lesson.students ? lesson.students.length : 0)
            
            // 检查该学生是否在这个课节中
            const studentInLesson = lesson.students && lesson.students.some(student => student.studentId === id)
            console.log('学生是否在课节中:', studentInLesson)
            
            if (studentInLesson) {
              // 从学生列表中移除该学生
              const updatedStudents = lesson.students.filter(student => student.studentId !== id)
              
              // 更新bookedCount
              const updatedBookedCount = Math.max(0, (lesson.bookedCount || 0) - 1)
              
              // 构建更新数据 - 使用正确的字段路径
              const updateData = {
                [`courses.${courseIndex}.lessons.${lessonKey}.students`]: updatedStudents,
                [`courses.${courseIndex}.lessons.${lessonKey}.bookedCount`]: updatedBookedCount
              }
              
              console.log('更新数据:', updateData)
              
              // 更新schedule
              const scheduleRes = await db.collection('schedules').doc(schedule._id).update({
                data: updateData
              })
              
              console.log('更新schedule结果:', scheduleRes)
            } else {
              console.log('学生不在该课节中，无需更新')
            }
          } else {
            console.log('未找到课节索引为', lessonKey, '的课节')
            if (targetCourse.lessons) {
              console.log('可用课节:', Object.keys(targetCourse.lessons))
            } else {
              console.log('该课程没有lessons字段')
            }
          }
        } else {
          console.log('未找到日期为', booking.courseDate, '的课程安排')
        }
      } catch (scheduleError) {
        console.error('更新schedule失败:', scheduleError)
      }
      
      try {
        // 无论是否找到对应的课程安排，都删除booking记录
        const bookingRes = await db.collection('booking').doc(booking._id).remove()
        console.log('删除booking结果:', bookingRes)
      } catch (bookingError) {
        console.error('删除booking记录失败:', bookingError)
      }
    }
    
    // 3. 最后删除学生信息
    const result = await db.collection('people').doc(id).remove()
    console.log('删除学生结果:', result)
    
    return { success: true, data: result }
  } catch (error) {
    console.error('删除人员失败:', error)
    return { success: false, error: error.message }
  }
}
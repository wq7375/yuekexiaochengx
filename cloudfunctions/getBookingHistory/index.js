// cloudfunctions/getBookingHistory/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

exports.main = async (event, context) => {
  const { studentId } = event
  
  try {
    // 获取booking记录
    const bookingRes = await db.collection('booking')
      .where({
        studentId: studentId
      })
      .orderBy('courseDate', 'desc')
      .get()
    
    // 获取相关的周课表信息
    const weekStarts = [...new Set(bookingRes.data.map(item => item.weekStart))]
    const schedulesRes = await db.collection('schedules')
      .where({
        weekStart: db.command.in(weekStarts)
      })
      .get()
    
    // 创建周课表映射
    const scheduleMap = {}
    schedulesRes.data.forEach(schedule => {
      scheduleMap[schedule.weekStart] = schedule
    })
    
    // 组合数据
    const result = bookingRes.data.map(booking => {
      const schedule = scheduleMap[booking.weekStart]
      if (!schedule) return null
      
      // 查找对应的课程日
      const courseDay = schedule.courses.find(c => c.date === booking.courseDate)
      if (!courseDay) return null
      
      // 查找对应的课程
      const lesson = courseDay.lessons[booking.lessonIndex]
      if (!lesson) return null
      
      // 返回组合后的数据
      return {
        _id: booking._id,
        courseType: booking.courseType,
        courseDate: booking.courseDate,
        lessonIndex: booking.lessonIndex,
        weekStart: booking.weekStart,
        studentId: booking.studentId,
        courseInfo: {
          date: courseDay.date,
          type: courseDay.type,
          lesson: {
            ...lesson,
            student: undefined // 移除student字段
          }
        }
      }
    }).filter(item => item !== null)
    
    return result
  } catch (err) {
    console.error('云函数执行失败：', err)
    return {
      error: err.message
    }
  }
}
// 云函数：checkClassStatus
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { weekStart, currentTime, thresholdTime } = event;
  const now = new Date(currentTime);
  const threshold = new Date(thresholdTime);
  
  try {
    let updated = false;
    let cancelledClasses = []; // 记录被取消的课程
    
    // 查询指定周的课表
    const scheduleRes = await db.collection('schedules')
      .where({ weekStart })
      .get();
    
    if (scheduleRes.data.length === 0) {
      return { success: true, updated: false, message: '未找到课表' };
    }
    
    const scheduleDoc = scheduleRes.data[0];
    const courses = scheduleDoc.courses || [];
    
    // 遍历所有课程
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      if (!course.lessons) continue;
      
      for (const lessonId in course.lessons) {
        if (lessonId === 'numOfLessonsAdded') continue;
        
        const lesson = course.lessons[lessonId];
        if (!lesson.startTime) continue;
        
        // 计算课程开始时间
        const courseDateTime = new Date(`${course.date}T${lesson.startTime}:00`);
        
        // 检查是否在2小时内开始且未处理过
        if (courseDateTime > now && 
            courseDateTime <= threshold && 
            lesson.status !== 'cancelled' && 
            lesson.status !== 'checked') {
          
          // 检查人数是否不足
          if (lesson.bookedCount < lesson.minCount) {
            console.log(`课程 ${course.date} ${lesson.startTime} 人数不足，需要取消`);
            
            // 取消课程并通知学员
            const cancelResult = await cancelClassAndNotify(
              weekStart,
              course.date,
              course.type,
              lessonId,
              lesson
            );
            
            if (cancelResult.success) {
              // 标记课程为已取消
              courses[i].lessons[lessonId].status = 'cancelled';
              courses[i].lessons[lessonId].cancelledAt = new Date();
              
              // 记录被取消的课程信息
              cancelledClasses.push({
                date: course.date,
                time: lesson.startTime,
                name: lesson.content,
                teacher: lesson.teacher,
                bookedCount: lesson.bookedCount,
                minCount: lesson.minCount
              });
              
              updated = true;
            }
          } else {
            // 标记为已检查（人数足够）
            courses[i].lessons[lessonId].status = 'checked';
            updated = true;
          }
        }
      }
    }
    
    // 如果有更新，保存到数据库
    if (updated) {
      await db.collection('schedules').doc(scheduleDoc._id).update({
        data: { courses }
      });
    }
    
    return { 
      success: true, 
      updated, 
      cancelledClasses,
      message: updated ? '发现并处理了人数不足的课程' : '无需更新' 
    };
  } catch (error) {
    console.error('检查课程状态失败:', error);
    return { success: false, updated: false, message: error.message };
  }
}

// 取消课程并通知学员
async function cancelClassAndNotify(weekStart, date, type, lessonIndex, lesson) {
  try {
    // 1. 查找课表文档
    const scheduleRes = await db.collection('schedules')
      .where({ weekStart })
      .get();
    
    if (scheduleRes.data.length === 0) {
      return { success: false, message: '未找到课表文档' };
    }
    
    const scheduleDoc = scheduleRes.data[0];
    const courses = scheduleDoc.courses || [];
    const courseIndex = courses.findIndex(c => c.date === date && c.type === type);
    
    if (courseIndex === -1) {
      return { success: false, message: '未找到对应课程' };
    }
    
    // 2. 通知已预约学员并返还次数
    if (lesson.students && lesson.students.length > 0) {
      for (const student of lesson.students) {
        // 返还预约次数
        const returnResult = await returnBookingCount(student.studentId, student.cardLabel);
        
        if (!returnResult.success) {
          console.error(`返还用户 ${student.studentId} 次数失败:`, returnResult.message);
          // 继续处理其他学生，不中断流程
          continue;
        }
        
        // 发送通知
        await sendNotification(student.studentId, {
          courseDate: date,
          startTime: lesson.startTime,
          courseName: lesson.content,
          teacher: lesson.teacher
        });
      }
    }
    
    return { success: true, message: '课程取消并通知学员成功' };
  } catch (error) {
    console.error('取消课程并通知学员失败:', error);
    return { success: false, message: error.message };
  }
}

// 返还预约次数
async function returnBookingCount(studentId, cardLabel) {
  try {
    // 获取用户信息
    const userRes = await db.collection('people').doc(studentId).get();
    if (!userRes.data) {
      return { success: false, message: '用户不存在' };
    }

    const user = userRes.data;
    const cards = user.cards || [];
    
    // 找到对应的卡
    const cardIndex = cards.findIndex(c => c.label === cardLabel);
    if (cardIndex === -1) {
      return { success: false, message: '未找到该用户的卡' };
    }
    
    // 增加卡次
    cards[cardIndex].remainingCount += 1;
    
    // 记录返还记录
    if (!cards[cardIndex].returnRecords) {
      cards[cardIndex].returnRecords = [];
    }
    
    cards[cardIndex].returnRecords.push({
      date: new Date(),
      reason: '课程人数不足取消',
      returnedCount: 1
    });
    
    // 更新用户信息
    await db.collection('people').doc(studentId).update({
      data: { cards }
    });
    
    console.log(`用户 ${studentId} 的卡 ${cardLabel} 返还次数成功`);
    return { success: true, message: '返还次数成功' };
  } catch (error) {
    console.error('返还预约次数失败:', error);
    return { success: false, message: error.message };
  }
}

// 发送通知
async function sendNotification(studentId, courseInfo) {
  try {
    // 获取用户的openid
    const userRes = await db.collection('people').doc(studentId).get();
    if (!userRes.data) {
      return { success: false, message: '用户不存在' };
    }
    
    const openid = userRes.data._openid;
    
    // 发送订阅消息
    const result = await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: '您的模板ID', // 需要在微信公众平台配置
      page: 'pages/yueke/yueke', // 点击通知后跳转的页面
      data: {
        thing1: { value: `${courseInfo.courseDate} ${courseInfo.startTime}` }, // 课程时间
        thing2: { value: courseInfo.courseName }, // 课程名称
        thing3: { value: courseInfo.teacher }, // 教师姓名
        thing4: { value: '人数不足，课程已取消' } // 取消原因
      }
    });
    
    console.log(`发送通知给用户 ${studentId} 成功:`, result);
    return { success: true, message: '发送通知成功' };
  } catch (error) {
    console.error('发送通知失败:', error);
    return { success: false, message: error.message };
  }
}
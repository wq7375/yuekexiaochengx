// pages/my/my.js
const db = wx.cloud.database();

Page({
  data: {
    userId: '',
    userName: '',
    phone: '',
    cards: [],
    historyList: [],
  },

  onLoad() {
    this.getStudentInfo();
  },

  getStudentInfo() {
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        const openid = res.result.openid;
        db.collection('people').where({ _openid: openid, role: 'student' }).get({
          success: res2 => {
            if (res2.data.length) {
              const user = res2.data[0];
              this.setData({
                userId: openid,
                userName: user.name,
                phone: user.phone,
                cards: this.processCards(user.cards || [])
              });
              this.getHistoryLessons(openid);
            } else {
              wx.showToast({ title: '未获取到学生信息', icon: 'none' });
            }
          }
        })
      }
    });
  },

  // 处理卡信息，补充剩余天数
  processCards(cards) {
    let today = new Date();
    return (cards || []).map(card => {
      let cardCopy = { ...card };
      if (card.expireDate) {
        let expire = new Date(card.expireDate);
        let remainDays = Math.ceil((expire.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        cardCopy.remainDays = remainDays > 0 ? remainDays : 0;
      }
      return cardCopy;
    });
  },

  // 获取历史上课信息
  getHistoryLessons(openid) {
    // booking 表存储约课记录，schedules 表存储课程内容
    // booking表建议结构: { studentOpenid, courseDate, courseType, lessonIndex }
    db.collection('booking').where({ studentOpenid: openid }).orderBy('courseDate', 'desc').get({
      success: res => {
        let bookings = res.data || [];
        if (bookings.length === 0) {
          this.setData({ historyList: [] });
          return;
        }
        // 批量查找课程内容
        let promises = bookings.map(booking => {
          return db.collection('schedules').where({ weekStart: booking.weekStart }).get()
            .then(scheduleRes => {
              if (scheduleRes.data.length) {
                let courses = scheduleRes.data[0].courses;
                let course = courses.find(c => c.date === booking.courseDate && c.type === booking.courseType);
                if (course && course.lessons && course.lessons[booking.lessonIndex]) {
                  let lesson = course.lessons[booking.lessonIndex];
                  return {
                    date: booking.courseDate,
                    startTime: lesson.startTime,
                    endTime: lesson.endTime,
                    type: booking.courseType,
                    content: lesson.content,
                    teacher: lesson.teacher
                  };
                }
              }
              return null;
            });
        });
        Promise.all(promises).then(list => {
          this.setData({ historyList: list.filter(item => !!item) });
        });
      }
    });
  }
});
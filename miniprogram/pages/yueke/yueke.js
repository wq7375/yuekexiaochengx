const db = wx.cloud.database();

// 工具：获取当周所有日期数组
function getWeekDates(startDateStr) {
  const arr = [];
  const startDate = new Date(startDateStr);
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    arr.push(d.toISOString().slice(0,10));
  }
  return arr;
}

// 工具：判断某课程是否可预约（提前2天10点开放，开课前2小时截止）
function isCanBook(courseDate, startTime) {
  const now = new Date();
  const courseDay = new Date(courseDate + 'T' + startTime + ':00');
  // 1. 提前两天10点可预约
  const openTime = new Date(courseDay);
  openTime.setDate(openTime.getDate() - 2);
  openTime.setHours(10, 0, 0, 0);

  // 2. 开课前2小时停止预约
  const closeTime = new Date(courseDay);
  closeTime.setHours(closeTime.getHours() - 2);

  return now >= openTime && now < closeTime;
}

Page({
  data: {
    weekStart: '',
    weekDates: [],
    courses: [],
    selectedType: 'group',
    selectedDate: '',
    lessons: [],
    userId: '',
    userName: '',
    weekOffset: 0, // 0:本周 7:下周
    cardType: '', // 增加：学生的卡类型
  },

  onLoad() {
    this.getUserInfoAndInit();
  },
  onShow() {
    this.getUserInfoAndInit();
  },
  getUserInfoAndInit() {
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        const openid = res.result.openid;
        if (!openid) {
          wx.showToast({ title: '未获取到用户身份', icon: 'none' });
          return;
        }
        db.collection('people').where({ _openid: openid, role: 'student' }).get({
          success: res2 => {
            if (res2.data.length) {
              this.setData({
                userId: openid,
                userName: res2.data[0].name,
                cardType: res2.data[0].cardType, // 获取卡类型，便于云函数判断
              });
            } else {
              this.setData({
                userId: openid,
                userName: '未知',
                cardType: ''
              });
            }
            this.initWeek();
          },
          fail: () => {
            this.setData({
              userId: openid,
              userName: '未知',
              cardType: ''
            });
            this.initWeek();
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '未获取到用户身份', icon: 'none' });
      }
    });
  },

  // 初始化课表和日期，支持本周和下周
  initWeek() {
    const today = new Date();
    const offset = this.data.weekOffset || 0;
    const start = new Date(today.setDate(today.getDate() - today.getDay() + 1 + offset));
    const weekStart = start.toISOString().slice(0,10);
    const weekDates = getWeekDates(weekStart);

    this.setData({ weekStart, weekDates });

    db.collection('schedules').where({ weekStart }).get({
      success: res => {
        if (res.data.length) {
          const courses = res.data[0].courses || [];
          this.setData({
            courses,
            selectedDate: weekDates[0]
          });
          this.updateLessons();
        } else {
          this.setData({
            courses: [],
            selectedDate: weekDates[0],
            lessons: []
          });
        }
      },
      fail: () => {
        this.setData({
          courses: [],
          selectedDate: weekDates[0],
          lessons: []
        });
      }
    });
  },

  // 切换团课/私教
  switchType(e) {
    const selectedType = e.currentTarget.dataset.type;
    this.setData({
      selectedType,
      selectedDate: this.data.weekDates[0]
    });
    this.updateLessons();
  },

  // 切换日期
  selectDate(e) {
    const date = e.currentTarget.dataset.date;
    this.setData({ selectedDate: date });
    this.updateLessons();
  },

  // 切换本周/下周
  showThisWeek() {
    this.setData({ weekOffset: 0 });
    this.initWeek();
  },
  showNextWeek() {
    const now = new Date();
    // 只有周天10点后可看下周课表
    if (now.getDay() !== 0 || now.getHours() < 10) {
      wx.showToast({ title: '周天10点后可查看下周课表', icon: 'none' });
      return;
    }
    this.setData({ weekOffset: 7 });
    this.initWeek();
  },

  // 更新当前日期下课程
  updateLessons() {
    const { courses, selectedDate, selectedType, userId } = this.data;
    const course = courses.find(c => c.date === selectedDate && c.type === selectedType);
    let lessons = course && course.lessons ? course.lessons.slice() : [];
    lessons.forEach(lesson => {
      lesson.hasBooked = lesson.students && lesson.students.some(s => s.studentId === userId);
      lesson.canBook = lesson.bookedCount < lesson.maxCount && !lesson.hasBooked && isCanBook(selectedDate, lesson.startTime);
      lesson.bookTimeTip = getBookTimeTip(selectedDate, lesson.startTime);
    });
    lessons.sort((a, b) => {
      const timeA = parseInt(a.startTime.replace(':', ''));
      const timeB = parseInt(b.startTime.replace(':', ''));
      return timeA - timeB;
    });
    this.setData({ lessons });
  },

  // 预约课程（改成调用reserveClass云函数，实现扣卡+写入booking原子操作）
  bookLesson(e) {
    const index = e.currentTarget.dataset.index;
    let lessons = this.data.lessons;
    let lesson = lessons[index];
    if (!this.data.userId) {
      wx.showToast({ title: '未获取到用户身份', icon: 'none' });
      return;
    }
    if (!lesson.canBook) {
      wx.showToast({ title: lesson.bookTimeTip || '不可预约', icon: 'none' });
      return;
    }
    if (!this.data.userName || this.data.userName === '未知') {
      wx.showToast({ title: '请先完善学生信息', icon: 'none' });
      return;
    }

    // 新增：调用云函数，先扣卡
    wx.cloud.callFunction({
      name: 'reserveClass',
      data: {
        studentId: this.data.userId,
        scheduleId: lesson.scheduleId || '',  // 如果有scheduleId则传
        action: 'reserve',
        cardType: this.data.cardType
      },
      success: res => {
        if (res.result.success) {
          // 若扣卡成功，再写schedules和booking表，保持你原有逻辑
          wx.cloud.callFunction({
            name: 'updateSchedule',
            data: {
              weekStart: this.data.weekStart,
              type: this.data.selectedType,
              date: this.data.selectedDate,
              lessonIndex: index,
              action: 'book',
              student: {
                studentId: this.data.userId,
                name: this.data.userName
              }
            },
            success: res2 => {
              if (res2.result.success) {
                db.collection('booking').add({
                  data: {
                    studentOpenid: this.data.userId,
                    name: this.data.userName,
                    courseDate: this.data.selectedDate,
                    courseType: this.data.selectedType,
                    lessonIndex: index,
                    weekStart: this.data.weekStart,
                    createTime: new Date()
                  },
                  success: () => {
                    wx.showToast({ title: '预约成功' });
                    this.updateLessons();
                  },
                  fail: () => {
                    wx.showToast({ title: '预约成功，但历史记录写入失败', icon: 'none' });
                    this.updateLessons();
                  }
                });
              } else {
                wx.showToast({ title: res2.result.msg || '预约失败', icon: 'none' });
              }
            }
          });
        } else {
          wx.showToast({ title: res.result.msg || '卡次数不足或已过期', icon: 'none' });
        }
      }
    });
  },

  // 取消预约（如需返还次数，建议云函数处理）
  cancelLesson(e) {
    const index = e.currentTarget.dataset.index;
    let lessons = this.data.lessons;
    let lesson = lessons[index];
    if (!this.data.userId) {
      wx.showToast({ title: '未获取到用户身份', icon: 'none' });
      return;
    }
    if (!lesson.hasBooked) {
      wx.showToast({ title: '未预约', icon: 'none' });
      return;
    }

    // 新增：调用云函数，返还卡次数（如需要）
    wx.cloud.callFunction({
      name: 'reserveClass',
      data: {
        studentId: this.data.userId,
        scheduleId: lesson.scheduleId || '',
        action: 'cancel',
        cardType: this.data.cardType
      },
      success: res => {
        // 继续原有逻辑，同步schedules和booking表
        const stuIdx = lesson.students.findIndex(s=>s.studentId==this.data.userId);
        lesson.students.splice(stuIdx, 1);
        lesson.bookedCount -= 1;
        if (lesson.bookedCount < 0) lesson.bookedCount = 0;
        let courses = this.data.courses;
        let cidx = courses.findIndex(c=>c.date==this.data.selectedDate && c.type==this.data.selectedType);
        if (cidx !== -1) {
          courses[cidx].lessons = lessons;
          db.collection('schedules').where({ weekStart: this.data.weekStart }).get({
            success: res => {
              db.collection('schedules').doc(res.data[0]._id).update({
                data: { courses }
              }).then(()=>{
                db.collection('booking').where({
                  studentOpenid: this.data.userId,
                  courseDate: this.data.selectedDate,
                  courseType: this.data.selectedType,
                  lessonIndex: index,
                  weekStart: this.data.weekStart
                }).get({
                  success: bookingRes => {
                    if (bookingRes.data.length) {
                      db.collection('booking').doc(bookingRes.data[0]._id).remove({
                        success: () => {
                          wx.showToast({ title: '已取消预约' });
                          this.updateLessons();
                        },
                        fail: () => {
                          wx.showToast({ title: '已取消课程，但历史记录删除失败', icon: 'none' });
                          this.updateLessons();
                        }
                      });
                    } else {
                      wx.showToast({ title: '已取消预约' });
                      this.updateLessons();
                    }
                  }
                });
              });
            }
          });
        }
      }
    });
  }
});

// 获取预约时间提示
function getBookTimeTip(courseDate, startTime) {
  const now = new Date();
  const courseDay = new Date(courseDate + 'T' + startTime + ':00');
  const openTime = new Date(courseDay);
  openTime.setDate(openTime.getDate() - 2);
  openTime.setHours(10, 0, 0, 0);
  const closeTime = new Date(courseDay);
  closeTime.setHours(closeTime.getHours() - 2);

  if (now < openTime) {
    return '提前两天早上10点开始预约';
  }
  if (now >= closeTime) {
    return '已截止预约';
  }
  return '';
}
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

Page({
  data: {
    weekStart: '',
    weekDates: [],
    courses: [],
    selectedType: 'group',
    selectedDate: '',
    lessons: [],
    userId: '',
    userName: ''
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
        db.collection('students').where({ openid }).get({
          success: res2 => {
            if (res2.data.length) {
              this.setData({
                userId: openid,
                userName: res2.data[0].name
              });
            } else {
              this.setData({
                userId: openid,
                userName: '未知'
              });
            }
            this.initWeek();
          },
          fail: () => {
            this.setData({
              userId: openid,
              userName: '未知'
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

  // 初始化课表和日期
  initWeek() {
    // 算出本周一
    const today = new Date();
    const weekStartDate = new Date(today.setDate(today.getDate() - today.getDay() + 1));
    const weekStart = weekStartDate.toISOString().slice(0,10);

    // 生成一周日期
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

  // 更新当前日期下课程
  updateLessons() {
    const { courses, selectedDate, selectedType, userId } = this.data;
    const course = courses.find(c => c.date === selectedDate && c.type === selectedType);
    let lessons = course && course.lessons ? course.lessons.slice() : [];
    lessons.forEach(lesson => {
      lesson.hasBooked = lesson.students && lesson.students.some(s => s.studentId === userId);
      lesson.canBook = lesson.bookedCount < lesson.maxCount && !lesson.hasBooked;
    });
    lessons.sort((a, b) => {
      const timeA = parseInt(a.startTime.replace(':', ''));
      const timeB = parseInt(b.startTime.replace(':', ''));
      return timeA - timeB;
    });
    this.setData({ lessons });
  },

  // 预约
  bookLesson(e) {
    const index = e.currentTarget.dataset.index;
    let lessons = this.data.lessons;
    let lesson = lessons[index];
    if (!this.data.userId) {
      wx.showToast({ title: '未获取到用户身份', icon: 'none' });
      return;
    }
    if (!lesson.canBook) {
      wx.showToast({ title: '不可预约', icon: 'none' });
      return;
    }
    lesson.bookedCount += 1;
    lesson.students.push({studentId: this.data.userId, name: this.data.userName});
    let courses = this.data.courses;
    let cidx = courses.findIndex(c=>c.date==this.data.selectedDate && c.type==this.data.selectedType);
    if (cidx !== -1) {
      courses[cidx].lessons = lessons;
      db.collection('schedules').where({ weekStart: this.data.weekStart }).get({
        success: res => {
          db.collection('schedules').doc(res.data[0]._id).update({
            data: { courses }
          }).then(()=>{
            wx.showToast({ title: '预约成功' });
            this.updateLessons(); // 局部刷新
          });
        }
      });
    }
  },

  // 取消预约
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
            wx.showToast({ title: '已取消预约' });
            this.updateLessons();
          });
        }
      });
    }
  }
});
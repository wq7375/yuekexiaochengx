const db = wx.cloud.database();

Page({
  data: {
    weekStart: '',
    courses: [],
    selectedType: 'group',
    selectedDate: '',
    lessons: [],
    dates: []
  },
  onLoad() {
    this.initWeek();
  },
  onShow() {
    this.initWeek();
  },
  initWeek() {
    const today = new Date();
    const start = new Date(today.setDate(today.getDate() - today.getDay() + 1));
    const weekStart = start.toISOString().slice(0,10);
    this.setData({ weekStart });
    db.collection('schedules').where({ weekStart }).get({
      success: res => {
        if (res.data.length) {
          const courses = res.data[0].courses;
          const dates = [...new Set(courses.filter(c=>c.type==this.data.selectedType).map(c=>c.date))];
          this.setData({ 
            courses,
            dates,
            selectedDate: dates[0]
          });
          this.updateLessons();
        }
      }
    });
  },
  switchType(e) {
    const selectedType = e.currentTarget.dataset.type;
    const courses = this.data.courses;
    const dates = [...new Set(courses.filter(c=>c.type==selectedType).map(c=>c.date))];
    this.setData({
      selectedType,
      dates,
      selectedDate: dates[0]
    });
    this.updateLessons();
  },
  selectDate(e) {
    const date = e.currentTarget.dataset.date;
    this.setData({ selectedDate: date });
    this.updateLessons();
  },
  updateLessons() {
    const {courses, selectedDate, selectedType} = this.data;
    const course = courses.find(c=>c.date==selectedDate && c.type==selectedType);
    let lessons = course ? course.lessons.slice() : [];
    lessons.sort((a, b) => {
      const timeA = parseInt(a.startTime.replace(':', ''));
      const timeB = parseInt(b.startTime.replace(':', ''));
      return timeA - timeB;
    });
    this.setData({ lessons });
  },
  // 管理端强制取消预约
  forceCancel(e) {
    const lessonIdx = e.currentTarget.dataset.lessonIdx;
    const stuIdx = e.currentTarget.dataset.stuIdx;
    const lesson = this.data.lessons[lessonIdx];
    const student = lesson.students[stuIdx];
    // 1. 先云函数更新schedules表（已约名单和计数）
    wx.cloud.callFunction({
      name: 'updateSchedule',
      data: {
        weekStart: this.data.weekStart,
        type: this.data.selectedType,
        date: this.data.selectedDate,
        lessonIndex: lessonIdx,
        action: 'forceCancel',
        student: student
      },
      success: res => {
        if (res.result.success) {
          // 2. 再删除booking表对应约课记录
          db.collection('booking').where({
            studentOpenid: student.studentId,
            courseDate: this.data.selectedDate,
            courseType: this.data.selectedType,
            lessonIndex: lessonIdx,
            weekStart: this.data.weekStart
          }).get({
            success: bookingRes => {
              if (bookingRes.data.length) {
                db.collection('booking').doc(bookingRes.data[0]._id).remove({
                  success: () => {
                    wx.showToast({ title: '已强制取消' });
                    this.initWeek();
                  },
                  fail: () => {
                    wx.showToast({ title: '强制取消成功，但历史记录删除失败', icon: 'none' });
                    this.initWeek();
                  }
                });
              } else {
                wx.showToast({ title: '已强制取消' });
                this.initWeek();
              }
            },
            fail: () => {
              wx.showToast({ title: '强制取消成功，但未查到历史记录', icon: 'none' });
              this.initWeek();
            }
          });
        } else {
          wx.showToast({ title: res.result.msg, icon: 'none' });
        }
      }
    });
  }
});

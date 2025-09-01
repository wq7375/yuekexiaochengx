const db = wx.cloud.database();

Page({
  data: {
    weekStart: '',
    courses: [],
    selectedType: 'group',
    selectedDate: '',
    lessons: [],
    dates: [],
    // 强制预约弹窗及学生/卡选择相关
    forceBookDialogVisible: false,
    forceBookLessonIdx: null,
    studentList: [],
    selectedStudentIdx: 0,
    cardList: [],
    selectedCardIdx: 0
  },
  onLoad() {
    this.initWeek();
    this.loadStudentList();
  },
  onShow() {
    this.initWeek();
    this.loadStudentList();
  },
  initWeek() {
    const today = new Date();
    const start = new Date(today.setDate(today.getDay() === 0 ? today.getDate() - 6 : today.getDate() - today.getDay() + 1));
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
        } else {
          this.setData({
            courses: [],
            dates: [],
            selectedDate: '',
            lessons: []
          });
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
  // === 强制预约相关 ===
  openForceBookDialog(e) {
    const lessonIdx = e.currentTarget.dataset.lessonIdx;
    // 默认选择第一个学生和卡
    let cardList = [];
    if (this.data.studentList.length > 0) {
      cardList = this.data.studentList[0].cards || [];
    }
    this.setData({
      forceBookDialogVisible: true,
      forceBookLessonIdx: lessonIdx,
      selectedStudentIdx: 0,
      cardList,
      selectedCardIdx: 0
    });
  },
  closeForceBookDialog() {
    this.setData({
      forceBookDialogVisible: false,
      forceBookLessonIdx: null
    });
  },
  loadStudentList() {
    db.collection('people').where({role: 'student'}).get({
      success: res => {
        this.setData({ studentList: res.data || [], selectedStudentIdx: 0 });
        // 预先填充卡列表
        const cardList = res.data.length > 0 ? (res.data[0].cards || []) : [];
        this.setData({ cardList, selectedCardIdx: 0 });
      }
    });
  },
  onForceBookStudentChange(e) {
    // 切换学生时，自动切换卡列表为该学生所有卡
    const idx = e.detail.value;
    const cardList = this.data.studentList[idx].cards || [];
    this.setData({ 
      selectedStudentIdx: idx, 
      cardList, 
      selectedCardIdx: 0 
    });
  },
  onForceBookCardChange(e) {
    this.setData({ selectedCardIdx: e.detail.value });
  },
  submitForceBook() {
    const lessonIdx = this.data.forceBookLessonIdx;
    const student = this.data.studentList[this.data.selectedStudentIdx];
    const card = this.data.cardList[this.data.selectedCardIdx];
    if (!student) {
      wx.showToast({ title: '请选择学生', icon: 'none' });
      return;
    }
    if (!card) {
      wx.showToast({ title: '请选择卡', icon: 'none' });
      return;
    }
    const lesson = this.data.lessons[lessonIdx];
    wx.cloud.callFunction({
      name: 'reserveClass',
      data: {
        studentId: student._id,
        scheduleId: lesson.scheduleId || '', // 若有
        action: 'reserve',
        cardLabel: card.label, // 关键：传label用于云函数查找对应卡
        isForce: true
      },
      success: res => {
        if (res.result.success) {
          wx.cloud.callFunction({
            name: 'updateSchedule',
            data: {
              weekStart: this.data.weekStart,
              type: this.data.selectedType,
              date: this.data.selectedDate,
              lessonIndex: lessonIdx,
              action: 'forceBook',
              student: {
                studentId: student._id,
                name: student.name
              }
            },
            success: res2 => {
              if (res2.result.success) {
                db.collection('booking').add({
                  data: {
                    studentOpenid: student._id,
                    name: student.name,
                    cardLabel: card.label,
                    courseDate: this.data.selectedDate,
                    courseType: this.data.selectedType,
                    lessonIndex: lessonIdx,
                    weekStart: this.data.weekStart,
                    createTime: new Date()
                  },
                  success: () => {
                    wx.showToast({ title: '已强制预约' });
                    this.closeForceBookDialog();
                    this.initWeek();
                  },
                  fail: () => {
                    wx.showToast({ title: '强制预约成功，但历史写入失败', icon: 'none' });
                    this.closeForceBookDialog();
                    this.initWeek();
                  }
                });
              } else {
                wx.showToast({ title: res2.result.msg || '强制预约失败', icon: 'none' });
                this.closeForceBookDialog();
              }
            }
          });
        } else {
          wx.showToast({ title: res.result.msg || '卡次数不足或已过期', icon: 'none' });
          this.closeForceBookDialog();
        }
      }
    });
  },
  // === 强制取消同原逻辑 ===
  forceCancel(e) {
    const lessonIdx = e.currentTarget.dataset.lessonIdx;
    const stuIdx = e.currentTarget.dataset.stuIdx;
    const lesson = this.data.lessons[lessonIdx];
    const student = lesson.students[stuIdx];
    wx.cloud.callFunction({
      name: 'reserveClass',
      data: {
        studentId: student.studentId,
        scheduleId: lesson.scheduleId || '', // 若有
        action: 'cancel',
        cardLabel: student.cardLabel || '', // 学生上应带有cardLabel
        isForce: true
      },
      success: res => {
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
          success: res2 => {
            if (res2.result.success) {
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
              wx.showToast({ title: res2.result.msg, icon: 'none' });
            }
          }
        });
      }
    });
  }
});
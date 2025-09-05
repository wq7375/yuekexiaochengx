const db = wx.cloud.database();

// 工具：本地日期格式化，避免 toISOString() 时区回退
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function formatDateLocal(d) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

// 工具：获取当周所有日期对象数组（从“周一”开始）
function getWeekDates(weekStartStr) {
  const start = new Date(weekStartStr + 'T00:00:00');
  const weekNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const date = formatDateLocal(d);
    arr.push({
      date,             // 'YYYY-MM-DD'
      day: date.slice(5), // 'MM-DD'（也可用 date 直接显示）
      week: weekNames[i]
    });
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

// 工具：判断某课程是否可以取消预约（标准为是否超出课程开始时间）
function isCanCancel(courseDate, startTime){
  // 创建给定时间的 Date 对象
  const courseDateTime = new Date(`${courseDate}T${startTime}`);
  // 获取当前本地时间
  const currentDateTime = new Date();
  // 比较并返回结果
  return currentDateTime < courseDateTime;
}

// 工具：预约时间提示
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

Page({
  data: {
    weekStart: '',
    weekDates: [],
    courses: [],
    selectedType: 'group',
    selectedDate: '',
    lessons: [],
    userId: '', // 用户的id(不是openid)
    userName: '',
    weekOffset: 0, // 0:本周 7:下周
    userCards: [], // 当前用户所有卡
    cardLabelIndex: 0, // 当前选中卡下标
    cardLabel: '', // 当前选中卡的label
  },

  onLoad() {
    this.getUserInfoAndInit();
  },
  onShow() {
    this.getUserInfoAndInit();
  },
  async getUserInfoAndInit() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getInfo'
      });
      
      if (res.result) {
        const user = res.result;
        const cards = user.cards || [];
        
        this.setData({
          userId: user._id,
          userName: user.name || '未知',
          userCards: cards,
          cardLabelIndex: 0,
          cardLabel: cards.length > 0 ? cards[0].label : ''
        });
        
        this.initWeek();
      } else {
        wx.showToast({ title: '未获取到用户信息', icon: 'none' });
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      wx.showToast({ title: '未获取到用户身份', icon: 'none' });
    }
  },

  // 卡片选择器
  onCardChange(e) {
    const idx = e.detail.value;
    const cards = this.data.userCards;
    this.setData({
      cardLabelIndex: idx,
      cardLabel: cards.length > 0 ? cards[idx].label : ''
    });
  },

  // 初始化课表和日期，支持本周和下周
  initWeek() {
    const now = new Date();
    const offset = this.data.weekOffset || 0;

    // 计算本周一（周日 getDay=0，则回退到上周一）
    const monday = new Date(now);
    const day = monday.getDay(); // 0=周日, 1=周一, ...
    const diffToMonday = (day === 0 ? -6 : 1 - day); // 距离周一的偏移
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() + diffToMonday + offset);

    const weekStart = formatDateLocal(monday);
    const weekDates = getWeekDates(weekStart);

    // 如果selectedDate没有值，则默认选中“周一”
    this.setData({
      weekStart,
      weekDates,
      selectedDate: this.data.selectedDate || weekDates[0].date
    });

    // 拉取当前周课表
    db.collection('schedules').where({ weekStart }).get({
      success: res => {
        const courses = res.data.length ? (res.data[0].courses || []) : [];
        this.setData({ courses });
        this.updateLessons();
      },
      fail: () => {
        this.setData({ courses: [], lessons: [] });
      }
    });
  },

  // 切换团课/私教
  switchType(e) {
    const selectedType = e.currentTarget.dataset.type;
    this.setData({
      selectedType,
      // selectedDate: (this.data.weekDates[0] && this.data.weekDates[0].date) || this.data.selectedDate // 如果取消注释，那么在切换团课/私教时会自动将日期变为周一
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
    // 只有周日上午10点后可看下周课表
    if (now.getDay() !== 0 || now.getHours() < 10) {
      wx.showToast({ title: '周日上午10点后可查看下周课表', icon: 'none' });
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
      lesson.canCancel = lesson.hasBooked && isCanCancel(selectedDate, lesson.startTime);
      lesson.bookTimeTip = getBookTimeTip(selectedDate, lesson.startTime);
    });
    lessons.sort((a, b) => {
      const timeA = parseInt(a.startTime.replace(':', ''));
      const timeB = parseInt(b.startTime.replace(':', ''));
      return timeA - timeB;
    });
    this.setData({ lessons });
  },

  // 预约课程
  bookLesson(e) {
    const idx = e.currentTarget.dataset.index;
    const { weekStart, selectedType, selectedDate, cardLabel, userId } = this.data;
  
    wx.showLoading({ title: '预约中...' })
    wx.cloud.callFunction({
      name: 'reserveClass',
      data: {
        action: 'reserve',
        studentId: userId,
        cardLabel,
        weekStart,
        type: selectedType,
        date: selectedDate,
        lessonIndex: idx
      }
    }).then(res => {
      if (res.result.success) {
        wx.cloud.callFunction({
          name: 'updateSchedule',
          data: {
            weekStart,
            type: selectedType,
            date: selectedDate,
            lessonIndex: idx,
            action: 'book',
            student: { studentId: userId, name: this.data.userName, cardLabel }
          }
        }).then(() => {
          this.initWeek()
          wx.showToast({
            title: '预约成功',
            icon: 'success',
            duration: 1500
          })
        });
      } else {
        wx.showToast({ title: res.result.msg || '预约失败', icon: 'none' });
      }
    });
  },
  

  cancelLesson(e) {
    const idx = e.currentTarget.dataset.index;
    const { weekStart, selectedType, selectedDate, cardLabel, userId } = this.data;

    wx.showLoading({ title: '取消中...' })
    wx.cloud.callFunction({
      name: 'reserveClass',
      data: {
        action: 'cancel',
        studentId: userId,
        cardLabel,
        weekStart,
        type: selectedType,
        date: selectedDate,
        lessonIndex: idx
      }
    }).then(res => {
      if (res.result.success) {
        wx.cloud.callFunction({
          name: 'updateSchedule',
          data: {
            weekStart,
            type: selectedType,
            date: selectedDate,
            lessonIndex: idx,
            action: 'cancel',
            student: { studentId: userId }
          }
        }).then(() => {
          this.initWeek()
          wx.showToast({
            title: '取消成功',
            icon: 'success',
            duration: 1500
          })
        });
      } else {
        wx.showToast({ title: res.result.msg || '取消失败', icon: 'none' });
      }
    });
  }
});
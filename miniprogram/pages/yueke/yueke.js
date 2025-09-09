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
  // 在yueke.js中修改initWeek方法
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

  // 如果selectedDate没有值，则默认选中"周一"
  this.setData({
    weekStart,
    weekDates,
    selectedDate: this.data.selectedDate || weekDates[0].date
  });

  // 拉取当前周课表
  db.collection('schedules').where({ weekStart }).get({
    success: res => {
      let courses = res.data.length ? (res.data[0].courses || []) : [];
      
      // 处理课程数据，将lessons对象转换为数组
      courses = courses.map(course => {
        if (course.lessons && typeof course.lessons === 'object') {
          const lessonsArray = [];
          for (const key in course.lessons) {
            if (key !== 'numOfLessonsAdded') {
              const lesson = course.lessons[key];
              lesson._id = key; // 保存课时的原始键
              lessonsArray.push(lesson);
            }
          }
          course.lessons = lessonsArray;
        }
        return course;
      });
      
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
  // 在yueke.js中修改updateLessons方法
// 在yueke.js的updateLessons方法中添加详细的状态检测日志
updateLessons() {
  const { courses, selectedDate, selectedType, userId, userName } = this.data;
  console.log('=== 开始更新课程列表 ===');
  console.log('当前用户ID:', userId);
  console.log('当前用户名:', userName);
  console.log('选择的日期:', selectedDate);
  console.log('课程类型:', selectedType);
  
  const course = courses.find(c => c.date === selectedDate && c.type === selectedType);
  console.log('找到的课程:', course);
  
  let lessons = [];
  if (course && course.lessons) {
    lessons = course.lessons.map(lesson => {
      // 确保students是数组
      if (!lesson.students) {
        lesson.students = [];
        console.log('初始化空学生列表');
      } else if (!Array.isArray(lesson.students)) {
        console.log('转换students为数组');
        lesson.students = Object.values(lesson.students);
      }
      
      // 检查当前用户是否已预约该课程
      const hasBooked = lesson.students.some(s => {
        const isBooked = s.studentId === userId;
        console.log('学生ID比较:', s.studentId, '===', userId, '=', isBooked);
        return isBooked;
      });
      
      const canCancel = hasBooked && isCanCancel(selectedDate, lesson.startTime);
      
      console.log('课时状态检测:', {
        课时ID: lesson._id,
        开始时间: lesson.startTime,
        已预约: hasBooked,
        可取消: canCancel,
        学生列表: lesson.students.map(s => ({id: s.studentId, name: s.name}))
      });
      
      // 添加预约状态信息
      return {
        ...lesson,
        hasBooked: hasBooked,
        canBook: lesson.bookedCount < lesson.maxCount && 
                 !hasBooked && 
                 isCanBook(selectedDate, lesson.startTime),
        canCancel: canCancel,
        bookTimeTip: getBookTimeTip(selectedDate, lesson.startTime)
      };
    });
  }
  
  // 按开始时间排序
  lessons.sort((a, b) => {
    const timeA = parseInt((a.startTime || '00:00').replace(':', ''), 10);
    const timeB = parseInt((b.startTime || '00:00').replace(':', ''), 10);
    return timeA - timeB;
  });
  
  console.log('最终课程列表:', lessons);
  this.setData({ lessons });
},
  // 预约课程
 // 在yueke.js中修改bookLesson和cancelLesson方法
// 预约课程
// 在yueke.js中修改bookLesson方法
// 在yueke.js中修改bookLesson方法
// 在bookLesson函数中添加卡片类型验证
bookLesson(e) {
  const index = e.currentTarget.dataset.index;
  const lesson = this.data.lessons[index];
  const lessonId = lesson._id;
  
  const { weekStart, selectedType, selectedDate, cardLabel, userId, userName, userCards, cardLabelIndex } = this.data;

  // 获取当前选中的卡片
  const selectedCard = userCards[cardLabelIndex];
  
  // 验证私教课只能使用私教卡
  if (selectedType === 'private' && selectedCard.type !== 'private') {
    wx.showToast({ 
      title: '私教课只能使用私教卡预约', 
      icon: 'none',
      duration: 2000
    });
    return;
  }

  wx.showLoading({ title: '预约中...' });
  
  wx.cloud.callFunction({
    name: 'reserveClass',
    data: {
      action: 'reserve',
      studentId: userId,
      cardLabel,
      weekStart,
      type: selectedType,
      date: selectedDate,
      lessonIndex: lessonId
    }
  }).then(res => {
    console.log('预约云函数返回:', res);
    if (res.result && res.result.success) {
      console.log('预约成功，开始更新课表');
      wx.cloud.callFunction({
        name: 'updateSchedule',
        data: {
          weekStart,
          type: selectedType,
          date: selectedDate,
          lessonIndex: lessonId,
          action: 'book',
          student: { 
            studentId: userId, 
            name: userName, 
            cardLabel 
          }
        }
      }).then(res2 => {
        console.log('更新课表云函数返回:', res2);
        if (res2.result && res2.result.success) {
          console.log('更新课表成功，重新加载数据');
          // 预约成功后，重新加载数据
          this.initWeek();
          wx.showToast({
            title: '预约成功',
            icon: 'success',
            duration: 1500
          });
        } else {
          console.error('更新课表失败:', res2.result);
          wx.showToast({ title: res2.result.msg || '更新课表失败', icon: 'none' });
        }
      }).catch(err => {
        console.error('更新课表失败:', err);
        wx.showToast({ title: '更新课表失败', icon: 'none' });
      });
    } else {
      console.error('预约失败:', res.result);
      wx.showToast({ title: (res.result && res.result.msg) || '预约失败', icon: 'none' });
    }
  }).catch(err => {
    console.error('预约失败:', err);
    wx.showToast({ title: '预约失败', icon: 'none' });
  }).finally(() => {
    wx.hideLoading();
  });
},

// 取消预约
cancelLesson(e) {
  const index = e.currentTarget.dataset.index;
  const lesson = this.data.lessons[index];
  const lessonId = lesson._id; // 使用课时的_id而不是数组索引
  
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
      lessonIndex: lessonId // 使用课时的_id
    }
  }).then(res => {
    if (res.result.success) {
      wx.cloud.callFunction({
        name: 'updateSchedule',
        data: {
          weekStart,
          type: selectedType,
          date: selectedDate,
          lessonIndex: lessonId, // 使用课时的_id
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
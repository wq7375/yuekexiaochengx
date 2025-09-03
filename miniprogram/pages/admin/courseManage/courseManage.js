const db = wx.cloud.database();

const hours = ['06','07','08','09','10','11','12','13','14','15','16','17','18','19','20'];
const minutes = ['00','15','30','45'];

// 工具：判断是否可制定下周课表（周六10点后）
function canSetNextWeekSchedule() {
  const now = new Date();
  return now.getDay() === 6 && now.getHours() >= 10;
}

// 工具：获取某周一日期（weekOffset=0本周，7下周）
function getWeekStart(weekOffset = 0) {
  const today = new Date();
  let day = today.getDay(); // 0=周日
  if (day === 0) day = 7;   // 周日视为第7天
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + 1 + weekOffset);
  return monday.toISOString().slice(0, 10);
}

Page({
  data: {
    weekStart: '', // 当前周一日期
    courses: [],
    selectedDate: '', // 当前选中日期
    selectedType: 'group',
    editingLesson: {
      startHour: '09',
      startMinute: '00',
      endHour: '10',
      endMinute: '00',
      teacher: '',
      content: '',
      minCount: '3',
      maxCount: '12'
    },
    hours,
    minutes,
    weekOffset: 0, // 0: 本周，7: 下周
    canSetNextWeek: false // 是否可制定下周课表
  },
  onLoad() {
    this.checkEditPermission();
    this.initWeek();
  },
  // 检查是否可制定下周课表
  checkEditPermission() {
    this.setData({ canSetNextWeek: canSetNextWeekSchedule() });
  },
  // 切换本周/下周课表
  showThisWeek() {
    this.setData({ weekOffset: 0 });
    this.initWeek();
  },
  showNextWeek() {
    if (!this.data.canSetNextWeek) {
      wx.showToast({ title: '周六10点后可制定下周课表', icon: 'none' });
      return;
    }
    this.setData({ weekOffset: 7 });
    this.initWeek();
  },
  // 初始化课表
  initWeek() {
    const { weekOffset } = this.data;
    const weekStart = getWeekStart(weekOffset);
    this.setData({ weekStart });
    db.collection('schedules').where({ weekStart }).get({
      success: res => {
        if (res.data.length) {
          this.setData({ courses: res.data[0].courses });
        } else {
          let courses = [];
          for (let i = 0; i < 7; i++) {
            let date = new Date(new Date(weekStart).getTime() + i * 86400000).toISOString().slice(0, 10);
            courses.push({ date, type: 'group', lessons: [] });
            courses.push({ date, type: 'private', lessons: [] });
          }
          this.setData({ courses });
        }
      }
    });
  },
  // 复制上周课表
  copyLastWeekSchedule() {
    const { weekOffset } = this.data;
    const targetWeekStart = getWeekStart(weekOffset);
    const lastWeekStart = getWeekStart(weekOffset - 7);

    wx.showLoading({ title: '复制中...' });
    db.collection('schedules').where({ weekStart: lastWeekStart }).get({
      success: res => {
        wx.hideLoading();
        if (!res.data.length) {
          wx.showToast({ title: '上周课表不存在', icon: 'none' });
          return;
        }
        // 深拷贝课程，清空预约相关字段
        const oldCourses = JSON.parse(JSON.stringify(res.data[0].courses));
        oldCourses.forEach(c => {
          c.lessons.forEach(l => {
            l.bookedCount = 0;
            l.students = [];
          });
        });
        this.setData({ courses: oldCourses });
        wx.showToast({ title: '已复制上周课表，可直接修改', icon: 'success' });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '复制失败', icon: 'none' });
      }
    });
  },
  // 选中某天某类型
  selectDateType(e) {
    const { date, type } = e.currentTarget.dataset;
    this.setData({ selectedDate: date, selectedType: type });
  },
  // picker选择小时或分钟
  onPickerChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    let editingLesson = this.data.editingLesson;
    editingLesson[field] = field.includes('Hour') ? this.data.hours[value] : this.data.minutes[value];
    this.setData({ editingLesson });
  },
  // 录入表单
  onLessonFieldInput(e) {
    const { field } = e.currentTarget.dataset;
    let editingLesson = this.data.editingLesson;
    editingLesson[field] = e.detail.value;
    this.setData({ editingLesson });
  },
  // 新增课程
  addLesson() {
    const { courses, selectedDate, selectedType, editingLesson } = this.data;
    if (!editingLesson.teacher.trim() || !editingLesson.content.trim()) {
      wx.showToast({ title: '请填写老师和课程内容', icon: 'none' });
      return;
    }
    const startTime = `${editingLesson.startHour}:${editingLesson.startMinute}`;
    const endTime = `${editingLesson.endHour}:${editingLesson.endMinute}`;
    const minCount = editingLesson.minCount && !isNaN(Number(editingLesson.minCount)) ? Number(editingLesson.minCount) : 3;
    const maxCount = editingLesson.maxCount && !isNaN(Number(editingLesson.maxCount)) ? Number(editingLesson.maxCount) : 12;

    let idx = courses.findIndex(c => c.date == selectedDate && c.type == selectedType);
    if (idx > -1) {
      courses[idx].lessons.push({
        startTime,
        endTime,
        teacher: editingLesson.teacher,
        content: editingLesson.content,
        minCount,
        maxCount,
        bookedCount: 0,
        students: []
      });
      this.setData({
        courses,
        editingLesson: {
          startHour: '09',
          startMinute: '00',
          endHour: '10',
          endMinute: '00',
          teacher: '',
          content: '',
          minCount: '3',
          maxCount: '12'
        }
      });
    }
  },
  onDeleteLesson(e) {
    const { date, type, index } = e.currentTarget.dataset;
    let courses = this.data.courses;
    let idx = courses.findIndex(c => c.date == date && c.type == type);
    courses[idx].lessons.splice(index, 1);
    this.setData({ courses });
  },
  saveSchedule() {
    const { weekStart, courses } = this.data;
    db.collection('schedules').where({ weekStart }).get({
      success: res => {
        if (res.data.length) {
          db.collection('schedules').doc(res.data[0]._id).update({
            data: { courses },
            success: () => { wx.showToast({ title: '课表已保存' }); }
          });
        } else {
          db.collection('schedules').add({
            data: { weekStart, courses },
            success: () => { wx.showToast({ title: '课表已上传' }); }
          });
        }
      }
    });
  },
  viewBookings(e) {
    const { date, type, index } = e.currentTarget.dataset;
    let courses = this.data.courses;
    let idx = courses.findIndex(c => c.date == date && c.type == type);
    let lesson = courses[idx].lessons[index];
    wx.showModal({
      title: '预约名单',
      content: lesson.students.map(s => s.name).join(', ') || '暂无预约'
    });
  }
});

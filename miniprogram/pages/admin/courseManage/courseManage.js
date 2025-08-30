const db = wx.cloud.database();

const hours = ['06','07','08','09','10','11','12','13','14','15','16','17','18','19','20'];
const minutes = ['00','15','30','45'];

Page({
  data: {
    weekStart: '', // 周一日期
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
    minutes
  },
  onLoad() {
    this.initWeek();
  },
  // 初始化本周课表
  initWeek() {
    const today = new Date();
    const start = new Date(today.setDate(today.getDate() - today.getDay() + 1)); // 周一
    const weekStart = start.toISOString().slice(0,10);
    this.setData({ weekStart });
    db.collection('schedules').where({ weekStart }).get({
      success: res => {
        if (res.data.length) {
          this.setData({ courses: res.data[0].courses });
        } else {
          let courses = [];
          for (let i=0; i<7; i++) {
            let date = new Date(new Date(weekStart).getTime() + i*86400000).toISOString().slice(0,10);
            courses.push({ date, type: 'group', lessons: [] });
            courses.push({ date, type: 'private', lessons: [] });
          }
          this.setData({ courses });
        }
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
  // 新增课程（校验数据并加入课程列表）
  addLesson() {
    const { courses, selectedDate, selectedType, editingLesson } = this.data;
    // 字段校验
    if (!editingLesson.teacher.trim() || !editingLesson.content.trim()) {
      wx.showToast({ title: '请填写老师和课程内容', icon: 'none' });
      return;
    }
    // 时间拼接
    const startTime = `${editingLesson.startHour}:${editingLesson.startMinute}`;
    const endTime = `${editingLesson.endHour}:${editingLesson.endMinute}`;
    // 人数校验
    const minCount = editingLesson.minCount && !isNaN(Number(editingLesson.minCount)) ? Number(editingLesson.minCount) : 3;
    const maxCount = editingLesson.maxCount && !isNaN(Number(editingLesson.maxCount)) ? Number(editingLesson.maxCount) : 12;

    let idx = courses.findIndex(c => c.date==selectedDate && c.type==selectedType);
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
        // 重置录入区
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
    let idx = courses.findIndex(c => c.date==date && c.type==type);
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
    let idx = courses.findIndex(c => c.date==date && c.type==type);
    let lesson = courses[idx].lessons[index];
    wx.showModal({
      title: '预约名单',
      content: lesson.students.map(s=>s.name).join(', ') || '暂无预约'
    });
  }
});
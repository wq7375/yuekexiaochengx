// 移除原有的数据库引用
// const db = wx.cloud.database();
// const _ = db.command;

const hours = ['06','07','08','09','10','11','12','13','14','15','16','17','18','19','20'];
const minutes = ['00','15','30','45'];

/******** 日期工具：全部使用本地时区，避免 toISOString 产生的跨天偏移 ********/
function pad(n){ return String(n).padStart(2,'0'); }
function formatDateLocal(d) {
  // 以本地时区生成 YYYY-MM-DD
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function parseDateLocal(ymd) {
  // 解析 'YYYY-MM-DD' 为本地日期
  const [y,m,d] = ymd.split('-').map(Number);
  return new Date(y, m-1, d, 0, 0, 0, 0);
}
function addDaysLocal(d, days) {
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  dd.setDate(dd.getDate() + days);
  return dd;
}
function startOfWeekMonday(baseDate, offsetDays = 0) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  let wd = d.getDay(); // 0=周日
  if (wd === 0) wd = 7; // 把周日视作第7天
  d.setDate(d.getDate() - wd + 1 + offsetDays); // 退到周一，然后加偏移（0=本周，7=下周）
  return d;
}
/**
 * 取本周/下周的"周一"字符串，以及为兼容旧数据的"周日锚点"字符串
 * - mondayStr: 本周（或下周）周一
 * - sundayAnchorStr: 周一的前一天（周日）。用于兼容旧数据把 weekStart 存成周日的情况
 */
function getWeekStartStrings(weekOffset = 0) {
  const mondayDate = startOfWeekMonday(new Date(), weekOffset);
  const mondayStr = formatDateLocal(mondayDate);
  const sundayAnchorStr = formatDateLocal(addDaysLocal(mondayDate, -1));
  const weekEndStr = formatDateLocal(addDaysLocal(mondayDate, 6)); // 当周周日
  return { mondayDate, mondayStr, sundayAnchorStr, weekEndStr };
}

// 工具：判断是否可制定下周课表（周六10点后）
function canSetNextWeekSchedule() {
  const now = new Date();
  return now.getDay() === 6 && now.getHours() >= 10;
}

Page({
  data: {
    weekStart: '', // 当前周一日期（字符串）
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
      minCount: ' ',
      maxCount: ' ',
      isLoading: true,
      isAdmin: false,
      errorMessage: ''
    },
    hours,
    minutes,
    weekOffset: 0, // 0: 本周，7: 下周
    canSetNextWeek: false // 是否可制定下周课表
  },

  onLoad() {
    this.initWeek();
    this.checkAdminPermission();
  },
  // 检查管理员权限
  checkAdminPermission() {
    wx.showLoading({ title: '检查权限中' })
    
    wx.cloud.callFunction({
      name: 'login', // 改为调用 login 云函数
      data: {
        // 传递空参数，避免创建新用户
        name: '',
        phone: ''
      },
      success: res => {
        wx.hideLoading()
        // console.log('login 云函数返回结果:', res)
        
        // 根据 login 函数的返回结果判断是否是管理员
        if (res.result && res.result.role === 'admin') {
          // 有权限，初始化页面
          this.setData({ 
            isAdmin: true,
            canSetNextWeek: canSetNextWeekSchedule() 
          }, () => {
            this.initWeek()
          })
        } else {
          // 无权限或其他错误
          this.setData({ 
            isLoading: false,
            errorMessage: res.result.message || '您不是管理员，无法访问此页面'
          })
          wx.showModal({
            title: '权限不足',
            content: res.result.message || '您不是管理员，无法访问此页面',
            showCancel: false,
            success: () => {
              wx.navigateBack()
            }
          })
        }
      },
      fail: err => {
        console.error('权限检查失败:', err)
        wx.hideLoading()
        this.setData({ 
          isLoading: false,
          errorMessage: '权限检查失败，请检查网络连接'
        })
        wx.showToast({ title: '权限检查失败', icon: 'none' })
      }
    })
  },

  // 切换本周/下周课表
  showThisWeek() {
    this.setData({ weekOffset: 0 }, () => this.initWeek());
  },
  showNextWeek() {
    if (!this.data.canSetNextWeek) {
      wx.showToast({ title: '周六10点后可制定下周课表', icon: 'none' });
      return;
    }
    this.setData({ weekOffset: 7 }, () => this.initWeek());
  },

  // 初始化课表
  initWeek() {
    const { weekOffset } = this.data;
    const { mondayStr } = getWeekStartStrings(weekOffset);
    this.setData({ weekStart: mondayStr });

    wx.cloud.callFunction({
      name: 'manageSchedule',
      data: {
        operation: 'getSchedule',
        data: { weekOffset }
      },
      success: res => {
        if (res.result.success) {
          const data = res.result.data;
          this.setData({
            courses: data.courses,
            selectedDate: data.selectedDate,
            selectedType: data.selectedType
          });
        } else {
          wx.showToast({ title: res.result.message || '课表加载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '课表加载失败', icon: 'none' });
      }
    });
  },

  // 复制上周课表
  copyLastWeekSchedule() {
    const { weekOffset } = this.data;
    
    wx.showLoading({ title: '复制中...' });
    wx.cloud.callFunction({
      name: 'manageSchedule',
      data: {
        operation: 'copyLastWeek',
        data: { weekOffset }
      },
      success: res => {
        wx.hideLoading();
        if (res.result.success) {
          this.setData({
            courses: res.result.data.courses,
            selectedDate: res.result.data.selectedDate,
            selectedType: res.result.data.selectedType
          });
          wx.showToast({ title: res.result.message, icon: 'success' });
        } else {
          wx.showToast({ title: res.result.message || '复制失败', icon: 'none' });
        }
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
    const editingLesson = { ...this.data.editingLesson };
    editingLesson[field] = field.includes('Hour') ? hours[value] : minutes[value];
    this.setData({ editingLesson });
  },

  // 录入表单
  onLessonFieldInput(e) {
    const { field } = e.currentTarget.dataset;
    const editingLesson = { ...this.data.editingLesson, [field]: e.detail.value };
    this.setData({ editingLesson });
  },

  // 新增课程
  addLesson() {
    const { courses, selectedDate, selectedType, editingLesson } = this.data;
    if (!selectedDate || !selectedType) {
      wx.showToast({ title: '请先选择日期和类型', icon: 'none' });
      return;
    }
    if (!editingLesson.teacher.trim() || !editingLesson.content.trim()) {
      wx.showToast({ title: '请填写老师和课程内容', icon: 'none' });
      return;
    }
    const startTime = `${editingLesson.startHour}:${editingLesson.startMinute}`;
    const endTime = `${editingLesson.endHour}:${editingLesson.endMinute}`;
    const minCount = editingLesson.minCount && !isNaN(Number(editingLesson.minCount)) ? Number(editingLesson.minCount) : 3;
    const maxCount = editingLesson.maxCount && !isNaN(Number(editingLesson.maxCount)) ? Number(editingLesson.maxCount) : 12;

    const idx = courses.findIndex(c => c.date === selectedDate && c.type === selectedType);
    if (idx > -1) {
      courses[idx].lessons.push({
        startTime,
        endTime,
        teacher: editingLesson.teacher.trim(),
        content: editingLesson.content.trim(),
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
    } else {
      wx.showToast({ title: '未找到匹配的日期/类型', icon: 'none' });
    }
  },

  onDeleteLesson(e) {
    const { date, type, index } = e.currentTarget.dataset;
    const { weekStart } = this.data;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这节课吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'manageSchedule',
            data: {
              operation: 'deleteLesson',
              data: { weekStart, date, type, lessonIndex: index }
            },
            success: (res) => {
              if (res.result.success) {
                wx.showToast({ title: '删除成功' });
                // 本地同步删除，避免刷新前数据不一致
                const courses = [...this.data.courses];
                const idx = courses.findIndex(c => c.date === date && c.type === type);
                if (idx > -1) {
                  courses[idx].lessons.splice(index, 1);
                  this.setData({ courses });
                }
              } else {
                wx.showToast({ title: res.result.message || '删除失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.showToast({ title: '删除操作失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 保存课表
  saveSchedule() {
    const { weekStart, courses } = this.data;
    
    wx.cloud.callFunction({
      name: 'manageSchedule',
      data: {
        operation: 'saveSchedule',
        data: { weekStart, courses }
      },
      success: res => {
        if (res.result.success) {
          wx.showToast({ title: res.result.message });
        } else {
          wx.showToast({ title: res.result.message || '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },
  
  goToschedules() {
    wx.navigateTo({ url: '/pages/admin/schedules/schedules' });
  },
  
  viewBookings(e) {
    const { date, type, index } = e.currentTarget.dataset;
    const courses = this.data.courses;
    const idx = courses.findIndex(c => c.date === date && c.type === type);
    if (idx === -1) {
      wx.showModal({ title: '预约名单', content: '暂无预约' });
      return;
    }
    const lesson = courses[idx].lessons[index] || {};
    const names = (lesson.students || []).map(s => s.name).join(', ');
    wx.showModal({
      title: '预约名单',
      content: names || '暂无预约'
    });
  }
});

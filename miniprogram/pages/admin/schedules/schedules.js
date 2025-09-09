const db = wx.cloud.database();
const _ = db.command;

// ===== 日期工具：全部使用本地时区，固定周一起算 =====
function pad(n){ return String(n).padStart(2,'0'); }
function formatDateLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function parseDateLocal(ymd) {
  const [y,m,d] = (ymd || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m-1, d);
}
function addDaysLocal(d, days) {
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  dd.setDate(dd.getDate() + days);
  return dd;
}
function startOfWeekMonday(baseDate) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  let wd = d.getDay(); // 0=周日
  if (wd === 0) wd = 7; // 周日视为第7天
  d.setDate(d.getDate() - wd + 1);
  return d;
}
/**
 * 返回本周的关键日期：
 * - mondayDate/mondayStr: 本周一
 * - sundayAnchorStr: 周一前一天（用于兼容旧的周日 weekStart）
 * - weekEndStr: 本周日（显示范围上限）
 */
function getWeekStartStrings(baseDate = new Date()) {
  const mondayDate = startOfWeekMonday(baseDate);
  const mondayStr = formatDateLocal(mondayDate);
  const sundayAnchorStr = formatDateLocal(addDaysLocal(mondayDate, -1));
  const weekEndStr = formatDateLocal(addDaysLocal(mondayDate, 6));
  return { mondayDate, mondayStr, sundayAnchorStr, weekEndStr };
}

Page({
  data: {
    // 周偏移量，0表示本周，7表示下周
    weekOffset: 0,
    // 用于云函数与 booking 记录：命中文档的实际 weekStart（若无文档，则为本周一）
    weekStart: '',
    // 用于显示过滤范围
    viewMonday: '',
    viewSunday: '',

    courses: [],
    selectedType: 'group',
    selectedDate: '',
    lessons: [],
    dates: [],

    // 强制预约弹窗及学生/卡选择相关
    forceBookDialogVisible: false,
    forceBookLessonId: null,
    studentList: [],
    selectedStudentIdx: 0,
    cardList: [],
    selectedCardIdx: 0
  },

  onLoad() {
    this.setData({ weekOffset: 0 }); // 默认显示本周
    this.initWeek();
    this.loadStudentList();
  },

  onShow() {
    this.initWeek();
    this.loadStudentList();
  },

  // 初始化本周（周一为起始），并兼容旧的周日 weekStart 文档
  initWeek() {
    // 根据weekOffset计算基准日期
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + this.data.weekOffset);
    
    const { mondayDate, mondayStr, sundayAnchorStr, weekEndStr } = getWeekStartStrings(baseDate);

    // 先把显示范围的周一/周日存入 data
    this.setData({ viewMonday: mondayStr, viewSunday: weekEndStr });

    // 兼容查询：既查"周一锚点"，也查"周日锚点"的旧文档
    db.collection('schedules')
      .where({ weekStart: _.in([mondayStr, sundayAnchorStr]) })
      .limit(1)
      .get({
        success: res => {
          if (res.data && res.data.length) {
            const doc = res.data[0];
            // 使用命中文档的实际 weekStart，保证后续更新/写 booking 能定位到原文档
            const dbWeekStart = doc.weekStart || mondayStr;

            // 仅保留本周一至本周日范围内的课程
            const startTs = parseDateLocal(mondayStr).getTime();
            const endTs = parseDateLocal(weekEndStr).getTime();
            let courses = Array.isArray(doc.courses) ? doc.courses.slice() : [];
            courses = courses.filter(c => {
              if (!c || !c.date) return false;
              const dt = parseDateLocal(c.date);
              if (!dt) return false;
              const ts = dt.getTime();
              return ts >= startTs && ts <= endTs;
            });

            // 生成本类型的日期列表（去重、升序）
            const selectedType = this.data.selectedType;
            const typeDates = [...new Set(courses.filter(c => c.type === selectedType).map(c => c.date))]
              .sort((a, b) => parseDateLocal(a).getTime() - parseDateLocal(b).getTime());

            // 默认选中：如果当前选中的日期不在本周或为空，则选中周一或第一个有课日
            let selectedDate = this.data.selectedDate;
            const inRange =
              selectedDate &&
              parseDateLocal(selectedDate) &&
              parseDateLocal(selectedDate).getTime() >= startTs &&
              parseDateLocal(selectedDate).getTime() <= endTs;

            if (!inRange) {
              selectedDate = typeDates[0] || mondayStr;
            }

            this.setData({
              weekStart: dbWeekStart,
              courses,
              dates: typeDates,
              selectedDate
            }, () => {
              this.updateLessons();
            });
          } else {
            // 没有命中文档：清空并设置 weekStart 为本周一
            this.setData({
              weekStart: mondayStr,
              courses: [],
              dates: [],
              selectedDate: '',
              lessons: []
            });
          }
        },
        fail: () => {
          // 查询失败也不要阻塞 UI
          this.setData({
            weekStart: mondayStr,
            courses: [],
            dates: [],
            selectedDate: '',
            lessons: []
          });
          wx.showToast({ title: '课表加载失败', icon: 'none' });
        }
      });
  },
  
  // 显示本周预约
  showThisWeek() {
    this.setData({ weekOffset: 0 });
    this.initWeek();
  },
  
  // 显示下周预约
  showNextWeek() {
    const now = new Date();
    const day = now.getDay(); // 0是周日，6是周六
    const hour = now.getHours();
    
    // 只有周六上午10点后可看下周预约
    
    this.setData({ weekOffset: 7 });
    this.initWeek();
  },

  // 切换课程类型
  switchType(e) {
    const selectedType = e.currentTarget.dataset.type;
    const { courses, viewMonday, viewSunday } = this.data;

    const startTs = parseDateLocal(viewMonday).getTime();
    const endTs = parseDateLocal(viewSunday).getTime();

    // 按类型+本周范围，重算日期列表
    const dates = [...new Set(
      courses
        .filter(c => c.type === selectedType)
        .filter(c => {
          const dt = parseDateLocal(c.date);
          if (!dt) return false;
          const ts = dt.getTime();
          return ts >= startTs && ts <= endTs;
        })
        .map(c => c.date)
    )].sort((a, b) => parseDateLocal(a).getTime() - parseDateLocal(b).getTime());

    // 如果当前选中的日期不在该类型的日期列表中，则切到第一个；否则保留
    let selectedDate = this.data.selectedDate;
    if (!dates.includes(selectedDate)) {
      selectedDate = dates[0] || this.data.viewMonday;
    }

    this.setData({
      selectedType,
      dates,
      selectedDate
    }, () => {
      this.updateLessons();
    });
  },

  // 切换日期
  selectDate(e) {
    const date = e.currentTarget.dataset.date;
    this.setData({ selectedDate: date }, () => this.updateLessons());
  },

  // 刷新课程列表（按开始时间排序）
  updateLessons() {
    const { courses, selectedDate, selectedType } = this.data;
    
    const course = courses.find(c => c.date === selectedDate && c.type === selectedType);
    
    let lessonsObj = course ? course.lessons : {};
   
    // 将lessons对象转换为数组，排除numOfLessonsAdded属性
    let lessonsArray = [];
    if (lessonsObj) {
      for (const key in lessonsObj) {
        if (key !== 'numOfLessonsAdded' && lessonsObj.hasOwnProperty(key)) {
          const lesson = lessonsObj[key];
          lesson["_id"] = key;
          
          // 确保students字段存在且是数组
          if (!lesson.students) {
            lesson.students = [];
          } else if (!Array.isArray(lesson.students)) {
            // 如果students不是数组，尝试转换为数组
            lesson.students = Object.values(lesson.students);
          }
        
          lessonsArray.push(lesson);
        }
      }
    }
    
    lessonsArray.sort((a, b) => {
      const timeA = parseInt((a.startTime || '00:00').replace(':', ''), 10);
      const timeB = parseInt((b.startTime || '00:00').replace(':', ''), 10);
      return timeA - timeB;
    });
    
    this.setData({ lessons: lessonsArray });
  },

  // === 强制预约相关 ===
  openForceBookDialog(e) {
    const lessonIdx = e.currentTarget.dataset.lessonIdx;
    const lesson = this.data.lessons[lessonIdx] || {};
    const lessonId = lesson._id; // 获取课时的_id
    
    // 默认选择第一个学生和卡
    let cardList = [];
    if (this.data.studentList.length > 0) {
      cardList = this.data.studentList[0].cards || [];
    }
    this.setData({
      forceBookDialogVisible: true,
      forceBookLessonId: lessonId, // 存储课时的_id
      selectedStudentIdx: 0,
      cardList,
      selectedCardIdx: 0
    });
  },

  closeForceBookDialog() {
    this.setData({
      forceBookDialogVisible: false,
      forceBookLessonId: null
    });
  },

  loadStudentList(cb) {
    db.collection('people').where({ role: 'student' }).get({
      success: res => {
        const list = res.data || []
        this.setData({
          studentList: list,
          selectedStudentIdx: 0,
          cardList: list.length > 0 ? (list[0].cards || []) : [],
          selectedCardIdx: 0
        }, cb)
      },
      fail: () => cb && cb()
    })
  },
  

  onForceBookStudentChange(e) {
    const idx = Number(e.detail.value)
    const list = this.data.studentList || []
    const safeIdx = Math.max(0, Math.min(idx, list.length - 1))
    const cardList = list[safeIdx] ? (list[safeIdx].cards || []) : []
    this.setData({
      selectedStudentIdx: safeIdx,
      cardList,
      selectedCardIdx: 0
    })
  }
,

  onForceBookCardChange(e) {
    this.setData({ selectedCardIdx: Number(e.detail.value) });
  },

  // 强制预约提交
  submitForceBook() {
    const lessonId = this.data.forceBookLessonId; // 使用课时的_id
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

    wx.cloud.callFunction({
      name: 'reserveClass',
      data: {
        studentId: student._id,
        cardLabel: card.label,
        weekStart: this.data.weekStart,
        type: this.data.selectedType,
        date: this.data.selectedDate,
        lessonIndex: lessonId, // 使用课时的_id
        action: 'reserve',
        isForce: true
      },
      success: res => {
        if (res.result && res.result.success) {
          wx.cloud.callFunction({
            name: 'updateSchedule',
            data: {
              weekStart: this.data.weekStart,
              type: this.data.selectedType,
              date: this.data.selectedDate,
              lessonIndex: lessonId, // 使用课时的_id
              action: 'forceBook',
              student: {
                studentId: student._id,
                name: student.name,
                cardLabel: card.label
              }
            },
            success: res2 => {
              if (res2.result && res2.result.success) {
                wx.showToast({ title: '已强制预约' });
                this.closeForceBookDialog();
                this.initWeek();
              } else {
                wx.showToast({ title: (res2.result && res2.result.msg) || '强制预约失败', icon: 'none' });
                this.closeForceBookDialog();
              }
            },
            fail: () => {
              wx.showToast({ title: '强制预约失败', icon: 'none' });
              this.closeForceBookDialog();
            }
          });
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '卡次数不足或已过期', icon: 'none' });
          this.closeForceBookDialog();
        }
      },
      fail: () => {
        wx.showToast({ title: '强制预约失败', icon: 'none' });
        this.closeForceBookDialog();
      }
    });
  },

  // 强制取消
  forceCancel(e) {
    const lessonIdx = e.currentTarget.dataset.lessonIdx;
    const stuIdx = e.currentTarget.dataset.stuIdx;
    const lesson = this.data.lessons[lessonIdx] || {};
    const student = (lesson.students || [])[stuIdx];

    if (!student) {
      wx.showToast({ title: '未找到该学员', icon: 'none' });
      return;
    }

    // 使用课时的_id而不是数组索引
    const lessonId = lesson._id;
    
    wx.showLoading({ title: '处理中...' });

    wx.cloud.callFunction({
      name: 'reserveClass',
      data: {
        studentId: student.studentId,
        cardLabel: student.cardLabel || '',
        weekStart: this.data.weekStart,
        type: this.data.selectedType,
        date: this.data.selectedDate,
        lessonIndex: lessonId, // 使用课时的_id
        action: 'cancel',
        isForce: true
      },
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.cloud.callFunction({
            name: 'updateSchedule',
            data: {
              weekStart: this.data.weekStart,
              type: this.data.selectedType,
              date: this.data.selectedDate,
              lessonIndex: lessonId, // 使用课时的_id
              action: 'forceCancel',
              student: student
            },
            success: res2 => {
              if (res2.result && res2.result.success) {
                wx.showToast({ title: '已强制取消' });
                this.initWeek();
              } else {
                wx.showToast({ 
                  title: (res2.result && res2.result.msg) || '强制取消失败', 
                  icon: 'none' 
                });
                this.initWeek();
              }
            },
            fail: () => {
              wx.showToast({ title: '强制取消失败', icon: 'none' });
              this.initWeek();
            }
          });
        } else {
          // 即使reserveClass失败，也尝试更新课表
          wx.cloud.callFunction({
            name: 'updateSchedule',
            data: {
              weekStart: this.data.weekStart,
              type: this.data.selectedType,
              date: this.data.selectedDate,
              lessonIndex: lessonId, // 使用课时的_id
              action: 'forceCancel',
              student: student
            },
            success: res2 => {
              if (res2.result && res2.result.success) {
                wx.showToast({ title: '已强制取消' });
                this.initWeek();
              } else {
                wx.showToast({ 
                  title: (res2.result && res2.result.msg) || '强制取消失败', 
                  icon: 'none' 
                });
                this.initWeek();
              }
            },
            fail: () => {
              wx.showToast({ title: '强制取消失败', icon: 'none' });
              this.initWeek();
            }
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        // 即使reserveClass失败，也尝试更新课表
        wx.cloud.callFunction({
          name: 'updateSchedule',
          data: {
            weekStart: this.data.weekStart,
            type: this.data.selectedType,
            date: this.data.selectedDate,
            lessonIndex: lessonId, // 使用课时的_id
            action: 'forceCancel',
            student: student
          },
          success: res2 => {
            if (res2.result && res2.result.success) {
              wx.showToast({ title: '已强制取消' });
              this.initWeek();
            } else {
              wx.showToast({ 
                title: (res2.result && res2.result.msg) || '强制取消失败', 
                icon: 'none' 
              });
              this.initWeek();
            }
          },
          fail: () => {
            wx.showToast({ title: '强制取消失败', icon: 'none' });
            this.initWeek();
          }
        });
      }
    });
  }
});
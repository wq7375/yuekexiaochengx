const db = wx.cloud.database();
const _ = db.command;

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
 * 取本周/下周的“周一”字符串，以及为兼容旧数据的“周日锚点”字符串
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
    const { mondayDate, mondayStr, sundayAnchorStr, weekEndStr } = getWeekStartStrings(weekOffset);
    this.setData({ weekStart: mondayStr });

    // 兼容查询：既查“周一锚点”，也查“周日锚点”的旧文档
    db.collection('schedules')
      .where({ weekStart: _.in([mondayStr, sundayAnchorStr]) })
      .limit(1)
      .get({
        success: res => {
          if (res.data.length) {
            // 命中文档（可能是旧的“周日锚点”）
            let doc = res.data[0];
            let courses = Array.isArray(doc.courses) ? doc.courses : [];

            // 只保留本周一到本周日的 7 天数据，杜绝 8-31 这样的跨周日期混入
            const startTs = parseDateLocal(mondayStr).getTime();
            const endTs = parseDateLocal(weekEndStr).getTime();
            courses = courses.filter(c => {
              if (!c || !c.date) return false;
              const ts = parseDateLocal(c.date).getTime();
              return ts >= startTs && ts <= endTs;
            });

            // 如果缺失某天/某类型，补齐空壳（保证管理端始终看到完整 7 天 x 2 类型）
            const wantDates = [...Array(7)].map((_, i) => formatDateLocal(addDaysLocal(mondayDate, i)));
            const wantTypes = ['group', 'private'];
            for (const dateStr of wantDates) {
              for (const tp of wantTypes) {
                const idx = courses.findIndex(x => x.date === dateStr && x.type === tp);
                if (idx === -1) {
                  courses.push({ date: dateStr, type: tp, lessons: [] });
                }
              }
            }
            // 稳定排序：按日期升序、类型（group 在前，再 private）
            courses.sort((a, b) => {
              const ta = parseDateLocal(a.date).getTime();
              const tb = parseDateLocal(b.date).getTime();
              if (ta !== tb) return ta - tb;
              const rank = t => (t === 'group' ? 0 : 1);
              return rank(a.type) - rank(b.type);
            });

            this.setData({
              courses,
              selectedDate: this.data.selectedDate || mondayStr,
              selectedType: this.data.selectedType || 'group'
            });
          } else {
            // 没有文档：按“周一”规范生成 7 天空壳
            const courses = [];
            for (let i = 0; i < 7; i++) {
              const date = formatDateLocal(addDaysLocal(mondayDate, i));
              courses.push({ date, type: 'group', lessons: [] });
              courses.push({ date, type: 'private', lessons: [] });
            }
            this.setData({
              courses,
              selectedDate: mondayStr,
              selectedType: 'group'
            });
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
    const { mondayStr: targetWeekStart } = getWeekStartStrings(weekOffset);
    const { mondayStr: lastWeekStart, sundayAnchorStr: lastWeekSundayAnchor } = getWeekStartStrings(weekOffset - 7);

    wx.showLoading({ title: '复制中...' });
    db.collection('schedules')
      .where({ weekStart: _.in([lastWeekStart, lastWeekSundayAnchor]) })
      .limit(1)
      .get({
        success: res => {
          wx.hideLoading();
          if (!res.data.length) {
            wx.showToast({ title: '上周课表不存在', icon: 'none' });
            return;
          }
          // 深拷贝课程，清空预约相关字段，仅保留本周 7 天的部分
          const { mondayDate: targetMonday, mondayStr: targetMondayStr, weekEndStr: targetWeekEndStr } = getWeekStartStrings(weekOffset);
          const startTs = parseDateLocal(targetMondayStr).getTime();
          const endTs = parseDateLocal(targetWeekEndStr).getTime();

          let oldCourses = JSON.parse(JSON.stringify(res.data[0].courses || []));
          oldCourses = oldCourses.filter(c => {
            if (!c || !c.date) return false;
            // 将旧数据的日期平移到目标周：用“星期几”来映射
            const ts = parseDateLocal(c.date).getTime();
            // 先把原日期的“星期几”算出来，再映射到目标周
            const dayIdx = new Date(parseDateLocal(c.date)).getDay() || 7; // 周日=7
            // 目标日期 = 目标周一 + (dayIdx-1)
            const mappedDate = formatDateLocal(addDaysLocal(targetMonday, dayIdx - 1));
            c.date = mappedDate;
            return true;
          });

          oldCourses.forEach(c => {
            (c.lessons || []).forEach(l => {
              l.bookedCount = 0;
              l.students = [];
            });
          });

          // 补齐漏天/漏类型
          const dates = [...Array(7)].map((_, i) => formatDateLocal(addDaysLocal(targetMonday, i)));
          const tps = ['group', 'private'];
          for (const d of dates) {
            for (const tp of tps) {
              if (!oldCourses.find(x => x.date === d && x.type === tp)) {
                oldCourses.push({ date: d, type: tp, lessons: [] });
              }
            }
          }
          oldCourses.sort((a, b) => {
            const ta = parseDateLocal(a.date).getTime();
            const tb = parseDateLocal(b.date).getTime();
            if (ta !== tb) return ta - tb;
            const rank = t => (t === 'group' ? 0 : 1);
            return rank(a.type) - rank(b.type);
          });

          this.setData({ courses: oldCourses, selectedDate: targetMondayStr, selectedType: 'group' });
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
    const editingLesson = { ...this.data.editingLesson };
    editingLesson[field] = field.includes('Hour') ? this.data.hours[value] : this.data.minutes[value];
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
    const { date, type, index } = e.currentTarget.dataset
    const { weekStart } = this.data
  
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这节课吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'deleteLessons',
            data: {
              weekStart,
              date,
              type,
              lessonIndex: index
            },
            success: (res) => {
              if (res.result.success) {
                wx.showToast({ title: '删除成功' })
                // 本地同步删除，避免刷新前数据不一致
                const courses = [...this.data.courses]
                const idx = courses.findIndex(c => c.date === date && c.type === type)
                if (idx > -1) {
                  courses[idx].lessons.splice(index, 1)
                  this.setData({ courses })
                }
              } else {
                wx.showToast({ title: res.result.message || '删除失败', icon: 'none' })
              }
            },
            fail: () => {
              wx.showToast({ title: '调用失败', icon: 'none' })
            }
          })
        }
      }
    })
  },  

  // 保存课表：如有旧文档命中则只更新 courses；无则按“周一”weekStart 新建
  saveSchedule() {
    const { weekStart, courses } = this.data;
    const { mondayStr, sundayAnchorStr } = getWeekStartStrings(0); // 这里的 0 不影响 weekStart 变量，只用于 in 查询备选
    db.collection('schedules')
      .where({ weekStart: _.in([weekStart, sundayAnchorStr]) })
      .limit(1)
      .get({
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
        },
        fail: () => {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      });
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


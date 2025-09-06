const db = wx.cloud.database();

Page({
  data: {
    tabList: [
      { type: 'group', label: '团课' },
      { type: 'private', label: '私教' }
    ],
    weekList: [],
    activeType: 'group',
    activeWeekIndex: 0,
    courseList: []
  },
  onLoad() {
    this.initWeeks();
  },
  
  // 初始化最近两周
  initWeeks() {
    db.collection('schedules').orderBy('weekStart','desc').limit(2).get({
      success: res => {
        const weekList = res.data.map((item, idx) => ({
          label: idx === 0 ? '本周课表' : '下周课表',
          weekStart: item.weekStart,
          courses: item.courses
        }));
        this.setData({ weekList, activeWeekIndex: 0 }, () => {
          this.refreshCourses();
        });
      }
    });
  },
  // 切换课程类型
  onTabChange(e) {
    this.setData({ activeType: e.currentTarget.dataset.type }, () => {
      this.refreshCourses();
    });
  },
  // 切换周
  onWeekChange(e) {
    this.setData({ activeWeekIndex: e.currentTarget.dataset.index }, () => {
      this.refreshCourses();
    });
  },
  // 课表筛选
  refreshCourses() {
    const { weekList, activeWeekIndex, activeType } = this.data;
    if (!weekList.length) return this.setData({ courseList: [] });
    const allCourses = weekList[activeWeekIndex].courses || [];
    const courseList = allCourses.filter(
      c => c.type == activeType && Array.isArray(c.lessons) && c.lessons.length > 0
    );
    this.setData({ courseList });
    /*
    console.log('courseList:', JSON.stringify(this.data.courseList));
    console.log('课表数据:', this.data.courseList);
    this.data.courseList.forEach(item => {
      console.log('日期:', item.date, 'lessons:', item.lessons);
    });
    console.log('游客端课表内容:', this.data.courseList);
    // */
  }
})

Page.prototype.formatDate = function(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return `${date.getMonth()+1}月${date.getDate()}日`;
};
  

// wxml过滤器

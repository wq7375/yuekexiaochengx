// pages/adminHome/adminHome.js
Page({
  data: {
    menus: [
      { name: '轮播图管理', url: '/pages/admin/bannerManage/bannerManage'},
      { name: '教师信息管理', url: '/pages/admin/teacherManage/teacherManage'},
      { name: '课程管理', url: '/pages/admin/courseManage/courseManage' },
      { name: '学生管理', url: '/pages/admin/studentManage/studentManage'}
    ]
  },
  goTobM() {
    wx.navigateTo({
      url: '/pages/admin/bannerManage/bannerManage'
    })
  },
  goTotM() {
    wx.navigateTo({
      url: '/pages/admin/teacherManage/teacherManage'
    })
  },
  goTocM() {
    wx.navigateTo({
      url: '/pages/admin/courseManage/courseManage'
    })
  },
  goTosM() {
    wx.navigateTo({
      url: '/pages/admin/studentManage/studentManage'
    })
  },
  goToSchedules() {
    wx.navigateTo({
      url: '/pages/admin/schedules/schedules'
    })
  }
});

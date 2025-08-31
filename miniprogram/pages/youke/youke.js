// pages/youke/youke.js
const db = wx.cloud.database();

Page({
  data: {
    banners: [],      // 轮播图数据（动态获取）
    teacherList: []   // 老师数据（动态获取）
  },
  onLoad: function (options) {
    this.getBanners();
    this.getTeachers();
  },

  // 获取轮播图数据
  getBanners() {
    db.collection('banners').orderBy('createTime', 'desc').get({
      success: res => {
        this.setData({
          banners: res.data
        });
      },
      fail: () => {
        this.setData({
          banners: []
        });
      }
    });
  },

  // 获取老师信息
  getTeachers() {
    db.collection('teachers').get({
      success: res => {
        this.setData({
          teacherList: res.data
        });
      },
      fail: () => {
        this.setData({
          teacherList: []
        });
      }
    });
  },

  goToyueke() {
    wx.switchTab({
      url: '/pages/yueke/yueke'
    });
  },
  goToexperience() {
    wx.navigateTo({
      url: '/pages/experience/experience'
    });
  },

  // 点击老师头像跳转详情页
  goTeacherDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/teacherDetail/teacherDetail?id=' + id
    });
  }
});
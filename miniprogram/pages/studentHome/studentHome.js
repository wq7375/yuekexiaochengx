const db = wx.cloud.database();

Page({
  data: {
    banners: [],
    teacherList: []
  },
  onLoad() {
    this.getBanners();
    this.getTeachers();
  },
  getBanners() {
    db.collection('banners').orderBy('createTime', 'desc').get({
      success: res => {
        // 支持新老字段兼容
        const banners = res.data.map(item => ({
          ...item,
          image: item.image || item.image // 兼容image/url字段
        }));
        this.setData({ banners });
      }
    });
  },
  getTeachers() {
    db.collection('teachers').orderBy('createTime', 'desc').get({
      success: res => {
        this.setData({ teacherList: res.data });
      }
    });
  },
  goToyueke() {
    wx.switchTab({ url: '/pages/yueke/yueke' });
  },
  goTomy() {
    wx.switchTab({ url: '/pages/my/my' });
  },
  goTeacherDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/teacherDetail/teacherDetail?id=' + id });
  }
});
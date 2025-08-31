// pages/admin/bannerManage/bannerManage.js
const db = wx.cloud.database();

Page({
  data: {
    bannerList: [],
    newBannerImage: '',
    newBannerDesc: ''
  },
  onLoad() {
    this.getBannerList();
  },
  getBannerList() {
    db.collection('banners').orderBy('createTime', 'desc').get({
      success: res => {
        this.setData({ bannerList: res.data });
      }
    });
  },
  chooseBannerImage() {
    wx.chooseImage({
      count: 1,
      success: res => {
        wx.cloud.uploadFile({
          cloudPath: 'banners/' + Date.now() + '.jpg',
          filePath: res.tempFilePaths[0],
          success: upRes => {
            this.setData({ newBannerImage: upRes.fileID });
          }
        });
      }
    });
  },
  onDescInput(e) {
    this.setData({ newBannerDesc: e.detail.value });
  },
  addBanner() {
    db.collection('banners').add({
      data: {
        image: this.data.newBannerImage,
        desc: this.data.newBannerDesc,
        createTime: new Date()
      },
      success: () => {
        wx.showToast({ title: '添加成功' });
        this.setData({ newBannerImage: '', newBannerDesc: '' });
        this.getBannerList();
      }
    });
  },
  onDeleteBanner(e) {
    const id = e.currentTarget.dataset.id;
    db.collection('banners').doc(id).remove({
      success: () => {
        wx.showToast({ title: '已删除' });
        this.getBannerList();
      }
    });
  }
});
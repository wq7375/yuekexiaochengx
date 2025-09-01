const db = wx.cloud.database();

Page({
  data: {
    banners: []
  },
  onLoad() {
    this.getBanners();
  },
  getBanners() {
    db.collection('banners').orderBy('createTime', 'desc').get({
      success: res => {
        this.setData({ banners: res.data });
      }
    });
  },
  onAddBanner() {
    wx.chooseImage({
      count: 1,
      success: res => {
        const filePath = res.tempFilePaths[0];
        const cloudPath = "banners/" + Date.now() + "_" + Math.floor(Math.random()*1000) + ".jpg";
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: uploadRes => {
            db.collection('banners').add({
              data: {
                url: uploadRes.fileID,
                createTime: new Date()
              },
              success: () => {
                wx.showToast({ title: '上传成功' });
                this.getBanners();
              }
            });
          }
        });
      }
    });
  },
  onDeleteBanner(e) {
    const id = e.currentTarget.dataset.id;
    db.collection('banners').doc(id).remove({
      success: () => {
        wx.showToast({ title: '已删除' });
        this.getBanners();
      }
    });
  }
});
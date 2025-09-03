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
      success: chooseRes => {
        const filePath = chooseRes.tempFilePaths[0];
        const cloudPath = 'banners/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.jpg';
    
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: uploadRes => {
            const fileID = uploadRes.fileID;
            // 将 fileID 存入数据库，例如 banners 表
            db.collection('banners').add({
              data: {
                image: fileID,
                createdAt: new Date()
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
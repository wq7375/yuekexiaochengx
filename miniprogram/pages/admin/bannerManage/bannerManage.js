const db = wx.cloud.database();

Page({
  data: {
    banners: []
  },

  onLoad() {
    this.getBanners();
  },

  /** 获取轮播图列表 */
  getBanners() {
    db.collection('banners').orderBy('createdAt', 'desc').get({
      success: res => {
        this.setData({ banners: res.data });
      },
      fail: err => {
        wx.showToast({ title: '加载失败', icon: 'none' });
        console.error('获取轮播图失败:', err);
      }
    });
  },

  /** 添加轮播图 */
  onAddBanner() {
    wx.chooseImage({
      count: 1,
      success: chooseRes => {
        const filePath = chooseRes.tempFilePaths[0];
        const cloudPath = 'banners/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.jpg';

        wx.showLoading({ title: '上传中...' });
        
        // 先上传图片到云存储
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: uploadRes => {
            const fileID = uploadRes.fileID;
            
            // 调用云函数添加轮播图记录
            wx.cloud.callFunction({
              name: 'addBanner',
              data: {
                cloudPath: cloudPath,
                fileID: fileID
              },
              success: res => {
                if (res.result.success) {
                  wx.showToast({ title: '上传成功' });
                  this.getBanners(); // 上传后刷新列表
                } else {
                  wx.showToast({ title: '保存失败: ' + res.result.error, icon: 'none' });
                }
              },
              fail: err => {
                wx.showToast({ title: '保存失败', icon: 'none' });
                console.error('addBanner fail', err);
              },
              complete: () => {
                wx.hideLoading();
              }
            });
          },
          fail: () => {
            wx.showToast({ title: '上传失败', icon: 'none' });
            wx.hideLoading();
          }
        });
      }
    });
  },

  /** 删除轮播图 */
  onDeleteBanner(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该轮播图吗？',
      success: res => {
        if (res.confirm) {
          // 调用云函数删除
          wx.cloud.callFunction({
            name: 'deleteBanner',
            data: { id },
            success: res => {
              if (res.result.success) {
                wx.showToast({ title: '已删除' });
                this.getBanners();
              } else {
                wx.showToast({ title: '删除失败: ' + res.result.error, icon: 'none' });
              }
            },
            fail: err => {
              wx.showToast({ title: '删除失败', icon: 'none' });
              console.error('deleteBanner fail', err);
            }
          });
        }
      }
    });
  }
});

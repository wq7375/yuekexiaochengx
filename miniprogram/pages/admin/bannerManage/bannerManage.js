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
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: uploadRes => {
            const fileID = uploadRes.fileID;
            db.collection('banners').add({
              data: {
                image: fileID, // ✅ 确保字段名为 image
                createdAt: db.serverDate() // ✅ 使用云端时间
              },
              success: () => {
                wx.showToast({ title: '上传成功' });
                this.getBanners(); // ✅ 上传后刷新列表
              },
              fail: () => {
                wx.showToast({ title: '保存失败', icon: 'none' });
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
          db.collection('banners').doc(id).remove({
            success: () => {
              wx.showToast({ title: '已删除' });
              this.getBanners();
            },
            fail: () => {
              wx.showToast({ title: '删除失败', icon: 'none' });
            }
          });
        }
      }
    });
  }
});

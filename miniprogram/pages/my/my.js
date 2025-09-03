const db = wx.cloud.database()

Page({
  data: {
    avatarUrl: '',
    userName: '',
    userPhone: '',
    cards: [],
    historyList: [],
    showUploadAvatar: false,
    studentId: '',
    openid: ''
  },

  onLoad() {
    this.initStudentInfo()
  },

  async initStudentInfo() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getInfo'
      });
      
      if (res.result) {
        const user = res.result;
        this.setData({
          userName: user.name || '',
          userPhone: user.phone || '',
          avatarUrl: user.avatarUrl || '',
          cards: user.cards || [],
          studentId: user._id,
          openid: user._openid,
          showUploadAvatar: !user.avatarUrl
        });
        
        this.loadHistory(user._openid);
      } else {
        wx.showToast({ title: '未获取到用户信息', icon: 'none' });
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      wx.showToast({ title: '获取用户信息失败', icon: 'none' });
    }
  },

  // 上传头像
  uploadAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const filePath = res.tempFilePaths[0]
        wx.showLoading({ title: '上传中' })
        wx.cloud.uploadFile({
          cloudPath: 'avatar/' + this.data.studentId + '_' + Date.now() + '.jpg',
          filePath,
          success: uploadRes => {
            this.setData({ avatarUrl: uploadRes.fileID, showUploadAvatar: false })
            db.collection('people').doc(this.data.studentId).update({
              data: { avatarUrl: uploadRes.fileID }
            })
            wx.hideLoading()
            wx.showToast({ title: '上传成功' })
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '上传失败', icon: 'none' })
          }
        })
      }
    })
  },

  // 拉取历史上课信息
  loadHistory(openid) {
    db.collection('booking').where({
      _openid: openid
    }).orderBy('date', 'desc').get({
      success: res => {
        this.setData({
          historyList: res.data.map(item => ({
            id: item._id,
            date: item.date,
            courseName: item.courseName,
            teacher: item.teacher
          }))
        })
      }
    })
  }
})


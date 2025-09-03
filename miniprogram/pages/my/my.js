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
    const studentId = wx.getStorageSync('userId')
    if (!studentId) {
      wx.showToast({ title: '未登录', icon: 'none' })
      return
    }

    // 查 people 表
    db.collection('people').doc(studentId).get({
      success: res => {
        const person = res.data
        this.setData({
          userName: person.name || '',
          userPhone: person.phone || '',
          avatarUrl: person.avatarUrl || '',
          cards: person.cards || [],
          studentId: person._id,
          showUploadAvatar: !person.avatarUrl
        })
        this.loadHistory(person._openid)
      }
    })
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


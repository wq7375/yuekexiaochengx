const db = wx.cloud.database()

Page({
  data: {
    avatarUrl: '',
    userName: '',
    userPhone: '',
    cards: [],
    historyList: [],
    cutoffDate:"",
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
          showUploadAvatar: !user.avatarUrl,
          cutoffDate: new Date(Date.now() + 259200000).toLocaleDateString('sv-SE') //默认显示未来三天以及过去的课表
        });
        
        this.loadHistory();
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
  onDateChange(e) {
    const selectedDate = e.detail.value // 格式为 "2025-09-04"
    this.setData({ cutoffDate: selectedDate })
  },


  loadHistory() {
    const { cutoffDate, studentId } = this.data
    // console.log('查询触发，openid:', studentId, 'cutoffDate:', cutoffDate)
  
    if (!cutoffDate) {
      wx.showToast({
        title: '请先选择日期',
        icon: 'none'
      })
      return
    }
  
    if (!studentId) {
      wx.showToast({
        title: '未获取到用户信息',
        icon: 'none'
      })
      return
    }
  
    wx.cloud.callFunction({
      name: 'getBookingHistory',
      data: {
        studentId: studentId
      },
      success: res => {
        if (res.result.error) {
          console.error('云函数返回错误：', res.result.error)
          wx.showToast({
            title: '查询失败',
            icon: 'none'
          })
          return
        }
        
        // console.log('云函数返回：', res.result)
        
        // 过滤并格式化数据
        const filtered = res.result
          .filter(item => item.courseDate < cutoffDate)
          .map(item => ({
            id: item._id,
            date: item.courseDate,
            courseName: item.courseInfo.lesson.content,
            startTime: item.courseInfo.lesson.startTime,
            endTime: item.courseInfo.lesson.endTime,
            teacher: item.courseInfo.lesson.teacher
          }))
        
        this.setData({
          historyList: filtered
        })
      },
      fail: err => {
        console.error('调用云函数失败：', err)
        wx.showToast({
          title: '查询失败',
          icon: 'none'
        })
      }
    })
  }
});
  



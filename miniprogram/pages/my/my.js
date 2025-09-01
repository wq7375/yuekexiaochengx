// pages/my/my.js
const db = wx.cloud.database();

Page({
  data: {
    avatarUrl: '',      // 学生头像
    userName: '',       // 姓名
    userPhone: '',      // 手机号
    cards: [],          // 卡片信息数组
    historyList: [],    // 历史上课信息
    showUploadAvatar: false, // 是否显示上传头像按钮
    studentId: '',      // 当前学生数据库_id
    openid: ''          // 当前openid
  },

  onLoad() {
    this.initStudentInfo();
  },

  // 初始化学生信息
  async initStudentInfo() {
    // 获取 openid
    const openid = await this.getOpenId();
    this.setData({ openid });
    // 查询 people 表
    db.collection('people').where({ _openid: openid, role: 'student' }).get({
      success: res => {
        if (res.data.length) {
          const person = res.data[0];
          this.setData({
            userName: person.name || '',
            userPhone: person.phone || '',
            avatarUrl: person.avatarUrl || '',
            cards: person.cards || [],
            studentId: person._id,
            showUploadAvatar: !person.avatarUrl  // 首次登录显示上传头像
          });
        }
        // 拉取历史记录
        this.loadHistory();
      }
    });
  },

  // 获取 openid
  getOpenId() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login', // 如果login返回openid，否则需补getOpenId
        success: res => resolve(res.result.openid),
        fail: () => reject('')
      });
    });
  },

  // 上传头像
  uploadAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const filePath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中' });
        wx.cloud.uploadFile({
          cloudPath: 'avatar/' + this.data.studentId + '_' + Date.now() + '.jpg',
          filePath: filePath,
          success: uploadRes => {
            this.setData({ avatarUrl: uploadRes.fileID, showUploadAvatar: false });
            db.collection('people').doc(this.data.studentId).update({
              data: { avatarUrl: uploadRes.fileID }
            });
            wx.hideLoading();
            wx.showToast({ title: '上传成功' });
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '上传失败', icon: 'none' });
          }
        });
      }
    });
  },

  // 拉取历史上课信息
  loadHistory() {
    db.collection('booking').where({
      _openid: this.data.openid
    }).orderBy('date', 'desc').get({
      success: res => {
        this.setData({
          historyList: res.data.map(item => ({
            id: item._id,
            date: item.date,
            courseName: item.courseName,
            teacher: item.teacher
          }))
        });
      }
    });
  }
});


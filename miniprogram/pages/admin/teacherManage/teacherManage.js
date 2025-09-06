const db = wx.cloud.database();

Page({
  data: {
    teacherList: [],
    form: {
      avatar: '',
      name: '',
      intro: '',
      skillsStr: '',
      skills: [],
      video: '',
      editId: null
    }
  },

  onLoad() {
    this.getTeachers();
  },

  getTeachers() {
    db.collection('teachers').orderBy('createTime', 'desc').get({
      success: res => {
        this.setData({ teacherList: res.data });
      }
    });
  },

  onUploadAvatar() {
    wx.chooseImage({
      count: 1,
      success: res => {
        const filePath = res.tempFilePaths[0];
        const cloudPath = "teachers/avatar_" + Date.now() + "_" + Math.floor(Math.random() * 1000) + ".jpg";

        wx.showLoading({ title: '上传头像中...' });
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: uploadRes => {
            this.setData({ 'form.avatar': uploadRes.fileID });
          },
          fail: () => {
            wx.showToast({ title: '头像上传失败', icon: 'none' });
          },
          complete: () => {
            wx.hideLoading();
          }
        });
      }
    });
  },

  onUploadVideo() {
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: true,
      maxDuration: 60,
      success: res => {
        const filePath = res.tempFilePath;
        const cloudPath = "teachers/video_" + Date.now() + "_" + Math.floor(Math.random() * 1000) + ".mp4";

        wx.showLoading({ title: '上传视频中...' });
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: uploadRes => {
            this.setData({ 'form.video': uploadRes.fileID });
          },
          fail: () => {
            wx.showToast({ title: '视频上传失败', icon: 'none' });
          },
          complete: () => {
            wx.hideLoading();
          }
        });
      }
    });
  },

  onDeleteVideo() {
    this.setData({ 'form.video': '' });
  },

  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onIntroInput(e) {
    this.setData({ 'form.intro': e.detail.value });
  },

  onSkillsInput(e) {
    this.setData({ 'form.skillsStr': e.detail.value });
  },

  onSubmit() {
    let { avatar, name, intro, skillsStr, video, editId } = this.data.form;

    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' });
      return;
    }

    let skills = skillsStr.split(/[，,]/).map(s => s.trim()).filter(Boolean);
    let data = {
      avatar,
      name,
      intro,
      skills,
      video
    };

    // 如果是编辑模式，添加更新时间
    if (editId) {
      data.updateTime = db.serverDate();
    } else {
      data.createTime = db.serverDate();
    }

    wx.showLoading({ title: editId ? '更新中...' : '添加中...' });

    if (editId) {
      // 更新 - 使用云函数
      wx.cloud.callFunction({
        name: 'updateTeacher',
        data: {
          id: editId,
          data: data
        },
        success: (res) => {
          if (res.result.success) {
            wx.hideLoading();
            wx.showToast({ title: '更新成功' });
            this.resetForm();
            this.getTeachers();
          } else {
            wx.hideLoading();
            wx.showToast({ title: '更新失败: ' + res.result.error, icon: 'none' });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({ title: '更新失败', icon: 'none' });
          console.error('updateTeacher fail', err);
        }
      });
    } else {
      // 新增 - 保持不变
      db.collection('teachers').add({
        data,
        success: () => {
          wx.hideLoading();
          wx.showToast({ title: '添加成功' });
          this.resetForm();
          this.getTeachers();
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '添加失败', icon: 'none' });
        }
      });
    }
  },

  onEditTeacher(e) {
    const id = e.currentTarget.dataset.id;
    let teacher = this.data.teacherList.find(t => t._id === id);
    this.setData({
      form: {
        avatar: teacher.avatar,
        name: teacher.name,
        intro: teacher.intro,
        skillsStr: teacher.skills.join(','),
        skills: teacher.skills,
        video: teacher.video || '',
        editId: teacher._id
      }
    });
  },

  onDeleteTeacher(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定删除？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          // 调用云函数删除
          wx.cloud.callFunction({
            name: 'deleteTeacher',
            data: { id },
            success: (res) => {
              if (res.result.success) {
                wx.hideLoading();
                wx.showToast({ title: '已删除' });
                this.getTeachers();
              } else {
                wx.hideLoading();
                wx.showToast({ title: '删除失败: ' + res.result.error, icon: 'none' });
              }
            },
            fail: (err) => {
              wx.hideLoading();
              wx.showToast({ title: '删除失败', icon: 'none' });
              console.error('deleteTeacher fail', err);
            }
          });
        }
      }
    });
  },
  
  // 重置表单
  resetForm() {
    this.setData({
      form: {
        avatar: '',
        name: '',
        intro: '',
        skillsStr: '',
        skills: [],
        video: '',
        editId: null
      }
    });
  }
});

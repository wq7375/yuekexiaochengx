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
        const filePath = res.tempFilePath; // ✅ 修复错误：不是数组
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
      video,
      createTime: db.serverDate() // ✅ 使用云端时间更准确
    };

    wx.showLoading({ title: editId ? '更新中...' : '添加中...' });

    const callback = () => {
      wx.hideLoading();
      wx.showToast({ title: editId ? '更新成功' : '添加成功' });
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
      this.getTeachers();
    };

    if (editId) {
      db.collection('teachers').doc(editId).update({
        data,
        success: callback,
        fail: () => wx.showToast({ title: '更新失败', icon: 'none' })
      });
    } else {
      db.collection('teachers').add({
        data,
        success: callback,
        fail: () => wx.showToast({ title: '添加失败', icon: 'none' })
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
    wx.showLoading({ title: '删除中...' });
    db.collection('teachers').doc(id).remove({
      success: () => {
        wx.hideLoading();
        wx.showToast({ title: '已删除' });
        this.getTeachers();
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    });
  }
});

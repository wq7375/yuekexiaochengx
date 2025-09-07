const db = wx.cloud.database();

const cardTypes = [
  { category: 'group', type: 'month', label: '团课月卡' },
  { category: 'group', type: 'season', label: '团课季卡' },
  { category: 'group', type: 'half', label: '团课半年卡' },
  { category: 'group', type: 'year', label: '团课年卡' },
  { category: 'group', type: 'count', label: '团课次卡' },
  { category: 'private', type: 'private', label: '私教卡' }
];

Page({
  data: {
    // 顶部标签：list | addStudent | addAdmin
    currentTab: 'list',

    // 列表
    peopleList: [],

    // 表单
    editingId: null, // 有值表示更新，无值表示新增
    name: '',
    phone: '',
    role: 'student', // student | admin

    // 学员卡编辑
    cardTypes,
    showCardEditor: false,
    cards: [],
    newCardTypeIndex: 0,
    selectedCardLabel: cardTypes[0].label,
    newCardRemainCount: null,
    newCardExpireDate: ''
  },

  onLoad() {
    this.getPeopleList();
  },

  // 切换顶部标签
  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    if (tab === 'addStudent') {
      this.resetForm();
      this.setData({ currentTab: tab, role: 'student' });
    } else if (tab === 'addAdmin') {
      this.resetForm();
      this.setData({ currentTab: tab, role: 'admin' });
    } else {
      // 返回列表
      this.setData({ currentTab: 'list' });
      this.resetForm();
    }
  },

  // 拉取列表
  getPeopleList() {
    db.collection('people').get({
      success: res => {
        this.setData({ peopleList: res.data });
      },
      fail: err => {
        wx.showToast({ title: '加载列表失败', icon: 'none' });
        console.error('getPeopleList fail', err);
      }
    });
  },

  // 表单输入
  onNameInput(e) { this.setData({ name: e.detail.value }); },
  onPhoneInput(e) { this.setData({ phone: e.detail.value }); },

  // 学员卡交互
  toggleCardEditor() {
    this.setData({ showCardEditor: !this.data.showCardEditor });
  },
  onCardTypeChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      newCardTypeIndex: idx,
      selectedCardLabel: this.data.cardTypes[idx].label
    });
  },
  onRemainCountInput(e) {
    const v = e.detail.value;
    this.setData({ newCardRemainCount: v === '' ? null : Number(v) });
  },
  onExpireDateChange(e) {
    this.setData({ newCardExpireDate: e.detail.value });
  },
  onAddCard() {
    const idx = this.data.newCardTypeIndex;
    const typeObj = this.data.cardTypes[idx];

    const card = {
      category: typeObj.category,
      type: typeObj.type,
      label: typeObj.label
    };

    if (typeObj.type === 'count' || typeObj.type === 'private') {
      card.remainCount = this.data.newCardRemainCount || 0;
    } else {
      if (!this.data.newCardExpireDate) {
        wx.showToast({ title: '请选择到期日期', icon: 'none' });
        return;
      }
      card.expireDate = this.data.newCardExpireDate;
    }

    this.setData({
      cards: [...this.data.cards, card],
      // 重置卡输入
      newCardTypeIndex: 0,
      selectedCardLabel: this.data.cardTypes[0].label,
      newCardRemainCount: null,
      newCardExpireDate: ''
    });
  },
  onDeleteCard(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const cards = this.data.cards.slice();
    cards.splice(idx, 1);
    this.setData({ cards });
  },

  // 编辑：跳转至对应标签并填充数据
  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const p = this.data.peopleList.find(x => x._id === id);
    if (!p) return;

    this.setData({
      editingId: p._id,
      name: p.name || '',
      phone: p.phone || '',
      role: p.role || 'student',
      cards: p.role === 'student' ? (p.cards || []) : [],
      showCardEditor: false,
      newCardTypeIndex: 0,
      selectedCardLabel: this.data.cardTypes[0].label,
      newCardRemainCount: null,
      newCardExpireDate: '',
      currentTab: p.role === 'admin' ? 'addAdmin' : 'addStudent'
    });
  },

  // 删除 - 修改为使用云函数
  // 修改onDelete方法
onDelete(e) {
  const id = e.currentTarget.dataset.id;
  wx.showModal({
    title: '确认删除',
    content: '删除后不可恢复，确定删除？',
    success: modalRes => {
      if (!modalRes.confirm) return;
      
      // 调用云函数删除
      wx.cloud.callFunction({
        name: 'deletePeople',
        data: { id },
        success: res => {
          if (res.result.success) {
            wx.showToast({ title: '删除成功' });
            this.getPeopleList();
            // 若正在编辑这条，重置并返回列表
            if (this.data.editingId === id) {
              this.resetForm();
              this.setData({ currentTab: 'list' });
            }
          } else {
            wx.showToast({ 
              title: '删除失败: ' + (res.result.error || '未知错误'), 
              icon: 'none' 
            });
            console.error('删除失败详情:', res.result);
          }
        },
        fail: err => {
          wx.showToast({ title: '删除失败', icon: 'none' });
          console.error('delete fail', err);
        }
      });
    }
  });
},

  // 保存（新增/更新）- 更新部分修改为使用云函数
  onSubmit() {
    const { editingId, name, phone, role, cards } = this.data;

    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' });
      return;
    }
    if (!phone) {
      wx.showToast({ title: '请填写手机号', icon: 'none' });
      return;
    }

    const data = { name, phone, role };
    if (role === 'student') data.cards = cards || [];

    // 修改onSubmit方法中的更新部分
if (editingId) {
  // 更新 - 使用云函数
  wx.cloud.callFunction({
    name: 'updatePeople',
    data: {
      id: editingId,
      data: data
    },
    success: res => {
      if (res.result.success) {
        wx.showToast({ title: '更新成功' });
        this.getPeopleList();
        this.resetForm();
        this.setData({ currentTab: 'list' });
      } else {
        wx.showToast({ 
          title: '更新失败: ' + (res.result.error || '未知错误'), 
          icon: 'none' 
        });
        console.error('更新失败详情:', res.result);
      }
    },
    fail: err => {
      wx.showToast({ title: '更新失败', icon: 'none' });
      console.error('update fail', err);
    }
  });
    } else {
      // 新增 - 保持不变
      db.collection('people').add({
        data,
        success: () => {
          wx.showToast({ title: '添加成功' });
          this.getPeopleList();
          this.resetForm();
          this.setData({ currentTab: 'list' });
        },
        fail: err => {
          wx.showToast({ title: '添加失败', icon: 'none' });
          console.error('add fail', err);
        }
      });
    }
  },

  // 取消
  onCancel() {
    this.resetForm();
    this.setData({ currentTab: 'list' });
  },

  // 重置表单
  resetForm() {
    this.setData({
      editingId: null,
      name: '',
      phone: '',
      role: 'student',
      cards: [],
      showCardEditor: false,
      newCardTypeIndex: 0,
      selectedCardLabel: this.data.cardTypes[0].label,
      newCardRemainCount: null,
      newCardExpireDate: ''
    });
  }
});
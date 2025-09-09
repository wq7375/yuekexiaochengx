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
    newCardExpireDate: '',

    // 重复检查相关
    checkingDuplicate: false,
    duplicateError: ''
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
  onNameInput(e) { 
    this.setData({ 
      name: e.detail.value,
      duplicateError: '' // 清空错误信息
    }); 
  },
  onPhoneInput(e) { 
    this.setData({ 
      phone: e.detail.value,
      duplicateError: '' // 清空错误信息
    }); 
  },

  // 检查姓名和手机号是否已存在
  async checkDuplicate() {
    const { editingId, name, phone } = this.data;
    
    if (!name || !phone) {
      return { hasDuplicate: false };
    }
    
    this.setData({ checkingDuplicate: true, duplicateError: '' });
    
    try {
      // 构建查询条件
      let query = db.collection('people').where({
        name: name,
        phone: phone
      });
      
      // 如果是编辑模式，排除当前编辑的记录
      if (editingId) {
        query = query.where({ _id: db.command.neq(editingId) });
      }
      
      const res = await query.get();
      
      this.setData({ checkingDuplicate: false });
      
      return {
        hasDuplicate: res.data.length > 0,
        duplicateData: res.data.length > 0 ? res.data[0] : null
      };
    } catch (err) {
      console.error('检查重复数据失败:', err);
      this.setData({ checkingDuplicate: false });
      return { hasDuplicate: false, error: err };
    }
  },

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
      currentTab: p.role === 'admin' ? 'addAdmin' : 'addStudent',
      duplicateError: '' // 清空错误信息
    });
  },

  // 删除 - 使用云函数
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

  // 保存（新增/更新）
  // 在onSubmit方法中，确保数据格式正确
async onSubmit() {
  const { editingId, name, phone, role, cards } = this.data;

  if (!name || !name.trim()) {
    wx.showToast({ title: '请填写姓名', icon: 'none' });
    return;
  }
  if (!phone || !phone.trim()) {
    wx.showToast({ title: '请填写手机号', icon: 'none' });
    return;
  }

  // 显示加载中提示
  wx.showLoading({
    title: '处理中...',
    mask: true
  });

  try {
    // 检查姓名和手机号是否已存在
    const duplicateCheck = await this.checkDuplicate();
    if (duplicateCheck.hasDuplicate) {
      wx.hideLoading();
      const duplicate = duplicateCheck.duplicateData;
      this.setData({
        duplicateError: `已存在相同姓名和手机号的${duplicate.role === 'admin' ? '管理员' : '学员'}：${duplicate.name}`
      });
      return;
    }

    // 确保数据格式正确
    const data = { 
      name: name.trim(), 
      phone: phone.trim(), 
      role: role 
    };
    
    if (role === 'student') {
      data.cards = cards || [];
    }

    if (editingId) {
      // 更新 - 使用云函数
      const res = await wx.cloud.callFunction({
        name: 'updatePeople',
        data: {
          id: editingId,
          data: data
        }
      });
      
      if (res.result && res.result.success) {
        wx.hideLoading();
        wx.showToast({ title: '更新成功' });
        this.getPeopleList();
        this.resetForm();
        this.setData({ currentTab: 'list' });
      } else {
        throw new Error(res.result.error || '更新失败');
      }
    } else {
      // 新增 - 使用云函数
      console.log('提交的数据:', data); // 添加日志
      
      const res = await wx.cloud.callFunction({
        name: 'addPeople',
        data: data
      });
      
      if (res.result && res.result.success) {
        wx.hideLoading();
        wx.showToast({ title: '添加成功' });
        this.getPeopleList();
        this.resetForm();
        this.setData({ currentTab: 'list' });
      } else {
        throw new Error(res.result.error || '添加失败');
      }
    }
  } catch (error) {
    wx.hideLoading();
    wx.showToast({ 
      title: error.message || '操作失败', 
      icon: 'none',
      duration: 3000
    });
    console.error('操作失败:', error);
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
      newCardExpireDate: '',
      duplicateError: ''
    });
  }
});
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  console.log('收到请求数据:', event); // 添加详细日志
  
  try {
    // 获取当前用户OpenID
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    // 验证当前用户是否是管理员
    const user = await db.collection('people').where({
      _openid: openid,
      role: 'admin'
    }).get()
    
    if (user.data.length === 0) {
      return { success: false, error: '无权限操作' }
    }
    
    // 检查数据是否存在
    const data = event.data || event; // 兼容两种参数格式
    console.log('处理的数据:', data);
    
    if (!data || !data.name || !data.phone) {
      return { 
        success: false, 
        error: '姓名和手机号不能为空',
        receivedData: data // 返回接收到的数据以便调试
      }
    }
    
    // 去除首尾空格
    const name = data.name.trim();
    const phone = data.phone.trim();
    
    if (!name || !phone) {
      return { 
        success: false, 
        error: '姓名和手机号不能为空' 
      }
    }
    
    // 检查姓名和手机号是否已存在
    const duplicateCheck = await db.collection('people').where({
      name: name,
      phone: phone
    }).get()
    
    if (duplicateCheck.data.length > 0) {
      const duplicate = duplicateCheck.data[0];
      return { 
        success: false, 
        error: `已存在相同姓名和手机号的${duplicate.role === 'admin' ? '管理员' : '学员'}：${duplicate.name}` 
      }
    }
    
    // 添加_openid字段，记录创建者
    const userData = {
      name: name,
      phone: phone,
      role: data.role || 'student',
      _openid: openid,
      createTime: db.serverDate()
    }
    
    // 如果是学员，添加卡片信息
    if (userData.role === 'student') {
      userData.cards = data.cards || [];
    }
    
    // 执行新增操作
    const result = await db.collection('people').add({
      data: userData
    })
    
    return { success: true, data: result }
  } catch (error) {
    console.error('新增人员失败:', error)
    return { success: false, error: error.message }
  }
}
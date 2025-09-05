// 云函数：login
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { name = '', phone = '' } = event
  console.log('login 调用参数:', { name, phone })
  
  // 如果 name 和 phone 都为空，则只查询不创建用户
  const readOnlyMode = !name && !phone

  // 查是否已有当前 openid
  const existRes = await db.collection('people').where({
    _openid: wxContext.OPENID
  }).get()

  if (existRes.data.length > 0) {
    const user = existRes.data[0]
    console.log('找到用户:', user)
    return { 
      success: true, 
      role: user.role, 
      userId: user._id,
      message: '用户已存在'
    }
  }

  // 如果是只读模式，直接返回未找到用户
  if (readOnlyMode) {
    return { 
      success: false, 
      role: 'none', 
      message: '用户未注册'
    }
  }

  // 以下代码只在非只读模式下执行（即实际登录时）
  if (!name || !phone) {
    return { 
      success: false, 
      role: 'none', 
      message: '姓名和电话不能为空'
    }
  }

  // 查是否已有任何用户
  const allRes = await db.collection('people').get()
  if (allRes.data.length === 0) {
    // 第一个用户 → 管理员
    const addRes = await db.collection('people').add({
      data: {
        name,
        phone,
        role: 'admin',
        _openid: wxContext.OPENID,
        cards: []
      }
    })
    return { 
      success: true, 
      role: 'admin', 
      userId: addRes._id,
      message: '已创建管理员账户'
    }
  }

  // 按姓名+电话匹配
  const matchRes = await db.collection('people').where({
    name,
    phone
  }).get()

  if (matchRes.data.length > 0) {
    // 更新 openid
    const new_openid = wxContext.OPENID
    await db.collection('people').doc(matchRes.data[0]._id).update({
      data: { _openid: new_openid }
    })
    return {
      success: true,
      role: matchRes.data[0].role,
      userId: matchRes.data[0]._id,
      message: '用户信息已更新'
    }
  }

  // 没匹配到
  return {
    success: false,
    role: 'none',
    message: '未找到匹配的用户'
  }
}
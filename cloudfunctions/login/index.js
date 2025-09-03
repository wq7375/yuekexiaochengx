// 云函数：login
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { name='注意！程序可能有漏洞', phone = '请联系开发者！'} = event

  // 查是否已有当前 openid
  var logging = 'none';
  logging = 'Searching by openid: \n'+wxContext.OPENID+'\n';//日志，可删
  const existRes = await db.collection('people').where({
    _openid: wxContext.OPENID
  }).get()

  if (existRes.data.length > 0) {
    const user = existRes.data[0]
    logging = logging+'user found:\nrole is: '+user.role+'\nid is: '+user._id+'\n';//日志，可删
    return { role: user.role, id: user._id, LogInfo: logging }
  }

  logging = logging+'no openid found, checking people lists...\n\n'; // 日志，可删
  // 查是否已有任何用户
  const allRes = await db.collection('people').get()
  if (allRes.data.length === 0) {
    // 第一个用户 → 管理员
    logging=logging+'no people in the lists. adding admin...\n\n';//日志，可删
    const addRes = await db.collection('people').add({
      data: {
        name,
        phone,
        role: 'admin',
        _openid: wxContext.OPENID,
        cards: []
      }
    })
    return { role: 'admin', id: addRes._id, LogInfo: logging }
  }

  // 按姓名+电话匹配
  logging=logging+'people list non empty, start searching by name and phone\nneme: '+name+'\nphone: '+phone+'\n';//日志，可删
  const matchRes = await db.collection('people').where({
    name,
    phone
  }).get()

  if (matchRes.data.length > 0) {
    // 更新 openid
    logging = logging+'people found, old openid is:\n'+matchRes.data[0]._openid+'\nand id is:\n'+matchRes.data[0]._id; //日志，可删
    new_openid = wxContext.OPENID;
    await db.collection('people').doc(matchRes.data[0]._id).update({
      data: { _openid: new_openid }
    })
    return {
      role: matchRes.data[0].role,
      id: matchRes.data[0]._id,
      LogInfo: logging
    }
  }

  // 没匹配到
  logging=logging+'no one found!\n\n';//日志，可删
  return {
    role: 'none',
    LogInfo: logging
  }
}


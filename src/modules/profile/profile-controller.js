const profileService = require('./profile-service');

exports.getProfile = async (req, res) => {
  // verify-token mengisi req.username / req.idUsername (bukan req.user).
  const username = req.username;

  try {
    const profile = await profileService.getProfileService(username);

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profil tidak ditemukan' });
    }

    // Jangan kirim hash password ke client.
    const data = { ...profile };
    delete data.Password;

    res.status(200).json({
      success: true,
      message: 'Profil ditemukan',
      data
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

exports.changePassword = async (req, res) => {
  const username = req.username;
  const { oldPassword, newPassword, confirmPassword } = req.body;

  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: 'Semua password harus diisi.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Password baru dan konfirmasi password tidak cocok.' });
  }

  try {
    await profileService.changePasswordService(username, oldPassword, newPassword);

    res.status(200).json({ success: true, message: 'Password berhasil diganti.' });
  } catch (err) {
    // Service melempar error 'Password lama tidak cocok.' -> 400, bukan 500.
    if (err && /Password lama tidak cocok/i.test(err.message || '')) {
      return res.status(400).json({ success: false, message: 'Password lama tidak cocok.' });
    }
    console.error('Error changing password:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
  }
};

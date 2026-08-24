const { put, del } = require('@vercel/blob');

// Fotos da vitrine vivem no Vercel Blob (não em disco local, que é efêmero
// em função serverless). O nome já é um UUID gerado pelo servidor, então
// colisão é praticamente impossível.
async function uploadImage(filename, buffer, contentType) {
  const blob = await put(`uploads/${filename}`, buffer, {
    access: 'public',
    contentType,
  });
  return blob.url;
}

async function deleteImage(url) {
  if (!url) return;
  try {
    await del(url);
  } catch (err) {
    console.error('Erro ao remover imagem do blob:', err.message);
  }
}

module.exports = { uploadImage, deleteImage };

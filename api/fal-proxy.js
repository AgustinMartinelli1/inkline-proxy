module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) {
    return res.status(500).json({ error: 'FAL_KEY no está configurada en el servidor' });
  }

  const body = req.body || {};

  // ---- MODO 1: subir una imagen a fal.ai y devolver su URL real ----
  if (body.action === 'upload') {
    try {
      const match = /^data:(.+);base64,(.*)$/.exec(body.dataUrl || '');
      if (!match) return res.status(400).json({ error: 'dataUrl inválida' });
      const contentType = match[1];
      const buffer = Buffer.from(match[2], 'base64');

      // paso 1: pedir un token de subida temporal
      const tokenRes = await fetch('https://rest.alpha.fal.ai/storage/auth/token?storage_type=fal-cdn-v3', {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}` }
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return res.status(tokenRes.status).json({ step: 'auth/token', error: tokenData });
      }

      // paso 2: subir el archivo real con ese token
      const uploadRes = await fetch(`${tokenData.base_url}/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.token}`,
          'Content-Type': contentType
        },
        body: buffer
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        return res.status(uploadRes.status).json({ step: 'files/upload', error: uploadData });
      }

      return res.status(200).json({ url: uploadData.access_url || uploadData.url || uploadData.fileUrl });
    } catch (err) {
      return res.status(500).json({ step: 'upload-exception', error: err.message });
    }
  }

  // ---- MODO 2: generar con un modelo de fal.ai (comportamiento normal) ----
  const { model, input } = body;
  if (!model || !input) {
    return res.status(400).json({ error: 'Faltan "model" o "input" en el body' });
  }

  try {
    const falRes = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    const data = await falRes.json();
    if (!falRes.ok) {
      return res.status(falRes.status).json(data);
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

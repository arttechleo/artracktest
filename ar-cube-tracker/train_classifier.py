"""
Automated coffin classifier training.
Positives  : trackimages/day/ + trackimages/night/
Negatives  : CIFAR-10 subset (auto-downloaded, ~30MB)
Output     : public/model/ (TF.js LayersModel)
"""
import os, glob, shutil
import numpy as np
from pathlib import Path
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import tensorflow as tf
from tensorflow import keras
import tensorflowjs as tfjs

IMG_SIZE   = (224, 224)
BATCH      = 16
EPOCHS     = 15
OUT_DIR    = 'public/model'
THRESHOLD  = 0.85  # written to metadata for runtime use

print("=== Coffin AR Classifier Training ===")
print(f"TF {tf.__version__}")

# -- 1. Load positive examples ------------------------------------------------
pos_paths = (
    glob.glob('trackimages/day/*.jpg')  +
    glob.glob('trackimages/day/*.jpeg') +
    glob.glob('trackimages/night/*.jpg')+
    glob.glob('trackimages/night/*.jpeg')
)
print(f"Positives (coffin): {len(pos_paths)} images")
assert len(pos_paths) >= 10, "Need at least 10 coffin images"

def load_img(path):
    img = tf.io.read_file(path)
    img = tf.image.decode_jpeg(img, channels=3)
    img = tf.image.resize(img, IMG_SIZE)
    return tf.cast(img, tf.float32)

pos_images = np.array([load_img(p).numpy() for p in pos_paths])
pos_labels = np.ones(len(pos_images), dtype=np.int32)

# -- 2. Auto-download negatives (CIFAR-10) ------------------------------------
print("Loading CIFAR-10 negatives (auto-download ~160MB first time)...")
(x_neg, _), _ = keras.datasets.cifar10.load_data()
# Resize CIFAR 32x32 -> 224x224, take 2x positives for balance
neg_count = min(len(pos_paths) * 2, 500)
idx = np.random.choice(len(x_neg), neg_count, replace=False)
neg_images = np.array([
    tf.image.resize(x_neg[i], IMG_SIZE).numpy()
    for i in idx
])
neg_labels = np.zeros(neg_count, dtype=np.int32)
print(f"Negatives (background): {neg_count} images")

# -- 3. Build dataset ---------------------------------------------------------
X = np.concatenate([pos_images, neg_images])
y = np.concatenate([pos_labels, neg_labels])

# Normalize to [0,1]
X = X / 255.0

# Shuffle
perm = np.random.permutation(len(X))
X, y = X[perm], y[perm]

# Augmentation for robustness to lighting
data_aug = keras.Sequential([
    keras.layers.RandomFlip('horizontal'),
    keras.layers.RandomRotation(0.1),
    keras.layers.RandomZoom(0.1),
    keras.layers.RandomBrightness(0.3),   # handles low/high light
    keras.layers.RandomContrast(0.3),
])

ds = tf.data.Dataset.from_tensor_slices((X, y))
ds = ds.shuffle(1000).batch(BATCH)
ds_aug = ds.map(lambda x, y: (data_aug(x, training=True), y))

# -- 4. Transfer learning: MobileNetV2 base + small head ----------------------
print("Building MobileNetV2 transfer model...")
base = keras.applications.MobileNetV2(
    input_shape=(*IMG_SIZE, 3),
    include_top=False,
    weights='imagenet'
)
base.trainable = False  # freeze base, train head only

model = keras.Sequential([
    base,
    keras.layers.GlobalAveragePooling2D(),
    keras.layers.Dropout(0.3),
    keras.layers.Dense(64, activation='relu'),
    keras.layers.Dense(1, activation='sigmoid')
])

model.compile(
    optimizer=keras.optimizers.Adam(1e-3),
    loss='binary_crossentropy',
    metrics=['accuracy']
)
model.summary()

# -- 5. Train -----------------------------------------------------------------
print(f"\nTraining for {EPOCHS} epochs...")
model.fit(
    ds_aug,
    epochs=EPOCHS,
    verbose=1,
    callbacks=[
        keras.callbacks.EarlyStopping(patience=4, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(patience=2, factor=0.5)
    ]
)

# -- 6. Fine-tune top layers of base ------------------------------------------
print("\nFine-tuning top 30 layers of MobileNetV2...")
base.trainable = True
for layer in base.layers[:-30]:
    layer.trainable = False

model.compile(
    optimizer=keras.optimizers.Adam(1e-5),
    loss='binary_crossentropy',
    metrics=['accuracy']
)
model.fit(ds_aug, epochs=10, verbose=1,
    callbacks=[keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True)]
)

# -- 7. Export to TF.js -------------------------------------------------------
print(f"\nExporting to TF.js -> {OUT_DIR}")
shutil.rmtree(OUT_DIR, ignore_errors=True)
os.makedirs(OUT_DIR)
tfjs.converters.save_keras_model(model, OUT_DIR)

# Write metadata.json matching Teachable Machine format
import json
meta = {
    "tfjsVersion": tfjs.__version__,
    "tmVersion": "2.4.0",
    "packageVersion": "0.8.5",
    "packageName": "@teachablemachine/image",
    "timeStamp": "",
    "userMetadata": {},
    "modelName": "coffin-classifier",
    "labels": ["background", "coffin"],
    "imageSize": 224,
    "threshold": THRESHOLD
}
with open(f'{OUT_DIR}/metadata.json', 'w') as f:
    json.dump(meta, f, indent=2)

print(f"\n=== DONE ===")
print(f"Model saved to {OUT_DIR}/")
for f in os.listdir(OUT_DIR):
    size = os.path.getsize(f'{OUT_DIR}/{f}') / 1024
    print(f"  {f}: {size:.1f} KB")
print("\nRun: node build.js && git add -f public/model dist/ && git commit -m 'feat: trained coffin classifier' && git push")

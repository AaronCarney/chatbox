# Fine-tuning datasets and transfer learning pipeline for K-12 content safety

**A frozen MobileNet-v2 backbone paired with independently trained MLP heads can cover all five gap categories within an estimated 8.5 MB float16 budget, using publicly available datasets ranging from 10,000+ images (violence, weapons, drugs/alcohol) down to a challenging ~2,200 images (hate symbols).** The critical bottleneck is not model architecture but data scarcity for hate symbols and the ethical unavailability of self-harm imagery. Transfer learning on a frozen backbone requires as few as **150–500 images per class** to reach 90–95% accuracy, but false-positive control in K-12 educational settings demands careful hard-negative curation, focal loss tuning, and threshold calibration that will likely consume more engineering effort than model training itself.

This report covers each gap category's dataset landscape, minimum sample requirements, hard-negative strategies for educational content, and a complete training-to-deployment pipeline targeting TF.js WASM on ARM Chromebooks.

---

## 5a: Available datasets span four orders of magnitude in size

### Violence / gore

The violence detection space is relatively mature, with several still-image datasets directly suitable for binary classification on a frozen backbone.

| Dataset | Size | Format | Classes | License | Source |
|---------|------|--------|---------|---------|--------|
| Violence vs. Non-Violence 11K | ~11,000 images | Still images ✅ | 2 (violent / non-violent) | Kaggle open | kaggle.com/datasets/abdulmananraja/real-life-violence-situations |
| SMFI (Social Media Fight Images) | ~5,691 images | Still images ✅ | 2 (fight / non-fight) | Academic request | github.com/seymanurakti/SMFI |
| Graphical Violence & Safe Images | ~2,000+ images | Still images ✅ | 2 (graphic violence / safe) | Kaggle open | kaggle.com/datasets/kartikeybartwal/graphical-violence-and-safe-images-dataset |
| RLVSD (frame extraction) | 2,000 videos → ~60K frames | Video → frames | 2 (violent / non-violent) | Kaggle community | kaggle.com/datasets/mohamedmustafa/real-life-violence-situations-dataset |
| UCF Crime Dataset | 1,900 videos (~1.38M frames) | Video (weak labels) | 13 anomaly classes + normal | Academic (UCF) | crcv.ucf.edu/projects/real-world/ |
| XD-Violence | 4,754 videos (217 hours) | Video (weak multi-label) | 6 violence types + normal | Academic | roc-ng.github.io/XD-Violence/ |
| AIRT Violence Detection | 350 clips | Video with hard negatives | 2 + fine-grained actions | Open research | github.com/airtlab/A-Dataset-for-Automatic-Violence-Detection-in-Videos |

**The 11K still-image dataset is the strongest starting point** — binary labels, reasonable size, and no frame-extraction needed. SMFI adds particular value because it deliberately includes hard negatives (hugging, sports, dancing) that help train against false positives. Combining these two yields **~16,700 still images** with complementary coverage. For additional diversity, extracting keyframes from RLVSD or XD-Violence can supplement the training set, though frame-level labels from video datasets are inherently noisy since they carry video-level annotations.

### Weapons (firearms, knives in threatening context)

Weapons detection datasets are the most abundant of all five categories, with the University of Granada's OD-WeaponDetection suite standing out as purpose-built for classification with built-in confuser objects.

| Dataset | Size | Format | Classes | License | Source |
|---------|------|--------|---------|---------|--------|
| OD-WeaponDetection: Sohas Classification | 9,544 images | Still images ✅ | 6 (pistol, knife, smartphone, wallet, bill, card) | CC BY-SA 4.0 | github.com/ari-dasci/OD-WeaponDetection |
| OD-WeaponDetection: Pistol Classification | 9,857 images | Still images ✅ | 102 (pistol + 101 confuser classes) | CC BY-SA 4.0 | Same repo |
| OD-WeaponDetection: Knife Classification | 10,039 images | Still images ✅ | 100 (knife + 99 confuser classes) | CC BY-SA 4.0 | Same repo |
| Deepcam/LinkSprite Gun Dataset | 51K gun crops + 94K negatives | Still images ✅ | 2 (gun / non-gun) | CC variant, email request | github.com/deepcam-cn/gun-detection-datasets |
| Roboflow: Guns and Knives | 9,835 images | Bbox (croppable) | 2 (gun, knife) | CC BY 4.0 | universe.roboflow.com/crime-detection/guns_n_knives-h4bky |
| Weapons in Images (Kaggle) | 5,695 images | Bbox (croppable) | 1 (weapon) | DbCL v1.0 | kaggle.com/datasets/jubaerad/weapons-in-images-segmented-videos |
| COCO "knife" subset | ~3,000+ instances | Bbox + segmentation | knife (dining context) | CC BY 4.0 | cocodataset.org |

**The Sohas Classification dataset is the ideal primary dataset** because it pairs weapons with visually similar handheld objects (smartphones, wallets, cards), directly training the model to distinguish threatening items from everyday objects. The Pistol and Knife Classification sets provide massive negative-class coverage with **101 and 99 confuser classes** respectively. The COCO "knife" class is useful specifically as a **hard negative** — its knives are dining/kitchen context, teaching the classifier that not all knives are weapons. Combined, these datasets offer **30,000+ classification-ready images** under permissive CC BY-SA 4.0 licensing.

### Hate symbols

This is the most data-scarce category. **No large-scale, ML-ready hate symbol image classification benchmark exists in the academic literature** — a significant gap in the field.

| Dataset | Size | Format | Classes | License | Source |
|---------|------|--------|---------|---------|--------|
| Roboflow "Hate symbols" (larger) | ~2,200 images | Bbox (croppable) | 6 (Antifa, anti-Muslim, anti-Semitic, ISIS, neo-Nazi, white supremacist) | Check project | Roboflow Universe search |
| Roboflow "moderate-hate-symbols" | 55 images | Bbox | 2 (Confederate flag, swastika) | CC BY 4.0 | universe.roboflow.com/roboflow-s8kjj/moderate-hate-symbols |
| OpnBrdrsAdvct/hate-symbols (GitHub) | 1,215 images (.webp) | Reference images, no ML labels | 214 symbol categories | Unspecified (scraped from ADL) | github.com/OpnBrdrsAdvct/hate-symbols |
| ADL Hate on Display™ | ~500 reference images | Reference encyclopedia, NOT training data | 200+ symbol categories | Copyrighted | adl.org/resources/hate-symbols/search |

**The 55-image Roboflow dataset is unusable** — at ~27 images per class, overfitting is virtually guaranteed even with aggressive augmentation. The **2,200-image Roboflow dataset is the only viable starting point**, averaging ~365 images per class across 6 categories — borderline adequate when combined with heavy augmentation and synthetic generation. The OpnBrdrsAdvct GitHub repo provides 1,215 reference images across 214 ADL-cataloged symbols, but these lack ML-ready labels and carry legal uncertainty as ADL-scraped content.

**The Buddhist/Hindu vs. Nazi swastika problem** has no dedicated dataset. Key visual discriminators include rotation angle (Nazi typically 45°, Buddhist typically upright), color context (red/black/white vs. gold/saffron), and surrounding iconography. Reliable disambiguation requires **200+ images per variant** with contextual features, and likely a two-stage approach: detect "swastika-like shape" first, then classify context.

**Recommended approach for hate symbols**: Use the 2.2K Roboflow dataset as a base, supplement with curated web-scraped data using the ADL taxonomy, and generate **200–500 synthetic variations per symbol class** using DreamBooth or Textual Inversion fine-tuned on 20–50 seed images of each target symbol.

### Self-harm / suicide imagery

**No ethically appropriate, large-scale self-harm image dataset exists for public use.** Content moderation platforms (Meta, Google) maintain internal datasets but do not release them. The research community primarily addresses self-harm detection through text-based social media analysis, not computer vision.

| Dataset | Size | Format | Relevance | License | Source |
|---------|------|--------|-----------|---------|--------|
| ISIC 2019 (skin lesions) | 25,331 images | Still images ✅ | Proxy (skin texture/lesion features) | CC-BY-NC | challenge.isic-archive.com/data/ |
| ISIC 2018 / HAM10000 | 10,015 images | Still images ✅ | Proxy (7 lesion classes) | CC-BY-NC | Same source |
| AZH Wound Classification | 730 images | Still images ✅ | Strong proxy (real wound images) | Public research | github.com/uwm-bigdata/wound-classification-using-images-and-locations |
| ZV_Self-harm-Dataset | 1,120 simulated + 118 real videos | Video (action recognition) | Direct but video-only | CC BY-NC-ND 4.0 | github.com/zv-ai/ZV_Self-harm-Dataset |
| Roboflow "image-self-harm" | 50 images | Segmentation | Direct but tiny | Check project | universe.roboflow.com/cyber-dive/image-self-harm |
| Medetec Wound Database | Hundreds | Still images | Proxy (open wounds) | Free research | medetec.co.uk/files/medetec-image-databases.html |

**The recommended proxy strategy is multi-stage**: pre-train on ISIC 2019 (25K+ images) for skin/lesion feature understanding, fine-tune on AZH wound data (730 images) for injury pattern detection, and supplement with Medetec wound images. This proxy approach detects visual indicators (wounds, cuts, blood) rather than self-harm intent — an appropriate limitation for a CV system that feeds into a broader safety pipeline. The 50-image Roboflow dataset is too small to use alone but could serve as a validation set.

### Drugs / alcohol imagery

Drug and alcohol detection benefits from existing ImageNet classes, since MobileNet-v2 was already pretrained on these exact categories.

| Dataset | Size | Format | Classes | License | Source |
|---------|------|--------|---------|---------|--------|
| ImageNet-1K subclasses | ~13,000 images (10 synsets) | Still images ✅ | beer_bottle, wine_bottle, pill_bottle, syringe, whiskey_jug, cocktail_shaker, corkscrew, goblet, etc. | Research registration | image-net.org |
| ePillID | ~13,000 images | Still images ✅ | 9,804 pill appearance classes (collapse to binary) | Research only | github.com/usuyama/ePillID-benchmark |
| NLM RxIMAGE / C3PI | Thousands | Still images ✅ | Prescription pills (lab photos) | Public domain (US Gov) | datadiscovery.nlm.nih.gov |
| COCO "bottle" + "wine glass" | Thousands of instances | Bbox + segmentation | bottle, wine glass | CC BY 4.0 | cocodataset.org |
| Kaggle pill datasets | 1K–20K (various) | Still images | Various pill classifications | Various | Multiple Kaggle sources |

**ImageNet subclasses are the ideal starting point** because MobileNet-v2's frozen backbone already has optimized features for these exact categories. Extracting beer_bottle, wine_bottle, pill_bottle, syringe, whiskey_jug, and cocktail_shaker synsets as positives, with water_bottle, pop_bottle, and coffee_mug as hard negatives, yields **10,000+ well-labeled images immediately**. Add collapsed ePillID data for pill detection. **Critical gaps**: no public datasets for marijuana/cannabis, vape pens/e-cigarettes, or drug paraphernalia (bongs, pipes). Custom web-scraped data collection is necessary for these subcategories.

---

## 5b: Transfer learning on frozen backbones needs surprisingly few samples

### The logarithmic relationship between data and accuracy

Shahinfar et al. (2020, "How many images do I need?") tested training set sizes of 10, 20, 50, 150, 500, and 1,000 images per class across six deep learning architectures. They found a **logarithmic relationship**: improvement slowed dramatically after 150 images per class, with no substantial gain beyond 500. Their best models reached **0.94 accuracy**. This finding aligns with the broader transfer learning literature showing that ImageNet pretraining reduces required data by **10–100×** compared to training from scratch.

| Target accuracy | Frozen backbone (per class) | With fine-tuning top layers (per class) | Notes |
|----------------|---------------------------|----------------------------------------|-------|
| ~90% | 100–200 images | 50–100 images | Standard augmentation; moderate domain similarity to ImageNet |
| ~95% | 300–500 images | 150–300 images | Heavy augmentation including Mixup/CutMix |
| ~99% | 1,000+ images | 500–1,000 images | Only achievable for simpler binary tasks |

For a **frozen backbone with a new 2-class MLP head**, the practical minimum is **150–200 images per class** with standard augmentation to achieve usable (~90%) accuracy. This is because the frozen MobileNet-v2 backbone already produces rich 1280-dimensional feature vectors; the MLP head is essentially performing logistic regression in a well-structured feature space.

### Data augmentation provides a 5–10× effective multiplier

Traditional augmentations (horizontal flip, rotation ±15°, brightness/contrast jitter, random cropping) do not literally multiply dataset size but expose the model to enough variation to act as a **5–10× equivalent sample increase**. Advanced techniques push further:

- **Mixup** (Zhang et al., 2018) creates linear interpolations between image pairs, providing ~22% relative error reduction on CIFAR-10. On small datasets (82 samples), Mixup improved accuracy from 76.5% to 80.1%.
- **CutMix** (Yun et al., 2019) pastes patches across images, outperforming Mixup by +0.97% on CIFAR-100.
- **Combined traditional + advanced augmentation** can make 200 images perform equivalently to 1,000+, delivering 5–15 percentage point accuracy improvements on small datasets.

### Synthetic data generation fills the gap for rare categories

For hate symbols and other data-scarce categories, **diffusion-model-based synthetic data generation is the most promising approach**. Azizi et al. (2023) demonstrated that augmenting ImageNet with diffusion-generated images yielded significant classification accuracy improvements. He et al. (2023, ICLR) found that using real data as guidance during diffusion generation, combined with mix training (real + synthetic), produces optimal results — generating **800 synthetic images per class** was effective.

**DreamBooth or Textual Inversion** can encode class-specific characteristics from as few as **3–5 seed images** into new tokens, then generate diverse synthetic variations. For hate symbols specifically, this means: collect 20–50 real images per symbol, fine-tune Stable Diffusion, generate 200–500 variations, and train on the combined real+synthetic set. A recent study on difficulty-controlled diffusion (2024) found that **moderate-difficulty synthetic samples** provide the most training benefit, and optimal results came from adding just 10% synthetic data.

### Hate symbol minimums for fine-grained disambiguation

Distinguishing Buddhist swastikas from Nazi swastikas is a **fine-grained classification** problem requiring at minimum **200–500 images per symbol subclass** with careful annotation of contextual features (rotation angle, color, surrounding imagery). Mandatory inclusion of hard negatives (benign similar symbols) at equal or greater volume is essential. A two-stage pipeline — detect "swastika-like shape" then classify "hate vs. benign" context — offers the most reliable separation, with a high confidence threshold (≥0.95) on the hate classification to minimize false positives.

---

## 5c: Hard negatives are the difference between a useful classifier and a broken one

### The iterative mining pipeline ChatBridge needs

The most practical approach for reducing false positives in K-12 educational content is an **iterative hard-negative mining pipeline**:

1. Train initial classifier on curated dataset with known hard negatives
2. Run classifier against a large corpus of actual ChatBridge educational game content
3. Collect all false positives (chess boards flagged as weapons, pixel art flagged as violence)
4. Add these as labeled hard negatives to the training set
5. Retrain and repeat until the false-positive rate meets target thresholds

This requires assembling a dedicated hard-negative dataset with **200–500 images per confuser category**:

- **Chess pieces** (especially knights, which resemble medieval weapons): various digital and physical chess sets
- **Go stones on boards**: black/white circular patterns that could trigger unexpected pattern matches
- **Pixel art swords, axes, shields**: 8-bit and 16-bit game art spanning multiple visual styles
- **Historical educational images**: medieval armor, Civil War photos, ancient weapons in textbook context
- **Cartoon/animated content**: stylized depictions in age-appropriate games
- **Sports equipment**: bats, hockey sticks, fencing foils, archery equipment
- **Kitchen and craft tools**: scissors, craft knives in educational context

Hard negatives should comprise **at least 30–50% of the negative class** in the training data. SMFI's deliberate inclusion of hugging and dancing images as fight-class negatives demonstrates this principle.

### Focal loss and threshold calibration control the precision-recall tradeoff

**Focal Loss** (Lin et al., 2017) applies a modulating factor (1−pₜ)^γ that down-weights easy, well-classified examples and concentrates training on hard, misclassified ones. For ChatBridge, where false positives are far more disruptive than false negatives (a missed detection feeds into other safety layers; a false positive directly breaks the learning experience), the recommended configuration is **γ=2 with α=0.25–0.4 for the "unsafe" class**. This penalizes false positives heavily by reducing the loss contribution from the positive (unsafe) class.

**Temperature scaling** (Guo et al., 2017) calibrates model confidence without changing accuracy. Modern neural networks are systematically overconfident; temperature scaling fits a single parameter T (typically 1.5–3.0) on a held-out calibration set so that predicted probabilities match actual likelihoods. After calibration, set an **asymmetric decision threshold** reflecting the relative cost of errors. If false positives are 10× as costly as false negatives in the K-12 context, the optimal threshold is approximately **0.9** — only flag content when the model is 90%+ confident it's unsafe.

### Contrastive learning separates realistic threats from game content

**Supervised Contrastive Loss** (Khosla et al., NeurIPS 2020) trains an encoder to push same-class embeddings together and different-class embeddings apart. For ChatBridge, this creates an embedding space where pixel-art swords cluster with educational game content and away from photographs of real weapons. The approach uses a two-stage pipeline: (1) train encoder with supervised contrastive loss using carefully constructed anchor-positive-negative triplets, (2) train a linear classifier on the frozen contrastive features.

### Two-stage coarse-to-fine classification dramatically reduces false positives

A **two-stage architecture** multiplies precision across stages. Stage 1 is a fast binary classifier ("potentially concerning" vs. "clearly safe") with a low threshold (0.3) to catch anything remotely suspicious — most educational content passes through immediately. Stage 2 runs only on the ~5% flagged by Stage 1, using a specialized fine-grained classifier trained heavily on hard negatives, with a high threshold (0.9). If Stage 1 has a 10% false positive rate and Stage 2 has 5%, the **compound false positive rate is ~0.5%**. This architecture also enables different latency budgets per stage and allows the fine-grained stage to incorporate context signals (which game is running, user age, activity type).

Industry practice validates this pattern: Anthropic's Constitutional Classifiers use a two-classifier system that reduced over-refusal rates to 0.38%, and Microsoft Azure's content safety runs both input and output through classification ensembles with calibrated severity levels.

### Allowlisting eliminates false positives on known content

For games already in the ChatBridge catalog, **pre-scanning all game assets and allowlisting them** eliminates false positives entirely for known content. This is the single most effective false-positive reduction strategy and should be implemented alongside the classifier.

---

## 5d: The complete training-to-deployment pipeline fits on a single GPU in under an hour

### Framework choice and architecture setup

**TensorFlow/Keras is strongly preferred** because TF.js is the export target. The conversion path is direct: Keras model → SavedModel → `tensorflowjs_converter` → model.json + weight shards. A PyTorch path (PyTorch → ONNX → TF SavedModel → TF.js) adds fragile intermediate steps and potential operator-compatibility issues.

The model loads MobileNet-v2 with ImageNet weights via `tf.keras.applications.MobileNetV2(include_top=False, weights='imagenet')`, freezes all backbone layers (`base_model.trainable = False`), applies `GlobalAveragePooling2D` to produce 1280-dimensional feature vectors, and attaches lightweight MLP heads: `Dense(128, relu) → Dropout(0.3) → Dense(1, sigmoid)` for each safety category.

### Train heads independently, wrap for inference

Since the backbone is frozen, **independent head training is the clear winner** over joint multi-task training. The backbone produces identical feature vectors regardless of which head is being trained, so joint training provides no representation benefit — it only complicates handling different dataset sizes per category. The recommended workflow:

1. **Extract features once**: run all images through the frozen backbone and save the resulting 1280-dim vectors to disk (~50 MB for 10K images)
2. **Train each MLP head independently** on its category's pre-extracted features — each head trains in **30–60 seconds** since it's essentially logistic regression on 1280 features
3. **Wrap independently-trained heads** into a single Keras Functional API model for export, or export backbone and heads as separate TF.js models for maximum modularity

Independent training naturally handles wildly different dataset sizes (10,000+ for weapons vs. 2,200 for hate symbols), enables per-head hyperparameter tuning, and supports incremental updates natively.

Recommended training hyperparameters: **Adam optimizer at 1e-3 learning rate**, batch size 32, 20–50 epochs with early stopping (patience=5), ReduceLROnPlateau (factor 0.5, patience 3), and 0.2–0.5 dropout on head layers.

### Float16 quantization is the right choice, and QAT is unnecessary

From TensorFlow's own benchmarks and the TF.js quantization examples repository: **float16 post-training quantization on MobileNet-v2 produces less than 0.1% accuracy loss** — effectively negligible. The TF.js team explicitly documents "no difference in accuracy" for float16. In contrast, uint8 post-training quantization shows "significant deterioration in accuracy" on MobileNet-v2, confirming the project's decision to avoid uint8.

Since float16 is already lossless enough, **quantization-aware training (QAT) is unnecessary** for this project. QAT targets int8 deployment and requires inserting fake quantization nodes during training and retraining for several epochs — added complexity with no benefit when float16 suffices.

Export is a single command:

```
tensorflowjs_converter \
    --input_format=tf_saved_model \
    --output_format=tfjs_graph_model \
    --quantize_float16 \
    ./saved_model/ \
    ./tfjs_output/
```

### The total model fits comfortably in 8.5 MB

| Component | Float32 | Float16 |
|-----------|---------|---------|
| MobileNet-v2 backbone (no top, 3.4M params) | ~13.6 MB | **~6.8 MB** |
| Single MLP head (1280→128→1, ~165K params) | ~660 KB | **~330 KB** |
| 5 MLP heads total | ~3.3 MB | **~1.65 MB** |
| **Total model** | **~16.9 MB** | **~8.5 MB** |

At **8.5 MB with float16**, the complete model (backbone + all 5 heads) is well under half the 15–20 MB budget, leaving room for future heads or a larger backbone if needed.

### Compute requirements are minimal

The frozen-backbone approach makes this an exceptionally lightweight training task:

- **Feature extraction** for 10K images: ~60–120 seconds on any modern GPU
- **Training each MLP head**: ~30–60 seconds on pre-extracted features
- **Total for all 5 heads**: under 10 minutes
- **Hardware**: any consumer GPU (GTX 1060+) works; even CPU-only training is feasible in reasonable time
- **Google Colab**: absolutely sufficient on the free tier (T4 GPU, 16 GB VRAM)
- **Memory**: 8–16 GB RAM is comfortable with tf.data pipeline

### Incremental updates work by design

The frozen backbone + independent heads architecture is inherently modular. The recommended deployment structure separates the backbone and each head into independent TF.js model files:

```
models/
├── backbone/v1/model.json + shards (~6.8 MB, cached by browser)
├── heads/
│   ├── violence/v1/model.json (~330 KB)
│   ├── weapons/v1/model.json (~330 KB)
│   ├── hate_symbols/v1/model.json (~330 KB)
│   ├── self_harm/v1/model.json (~330 KB)
│   ├── drugs_alcohol/v1/model.json (~330 KB)
│   └── new_category/v1/model.json  ← added later
└── manifest.json  ← routes to current version of each component
```

In TF.js, the backbone loads once and caches. Each head loads independently. **Adding a new category** requires only: (1) train new MLP head on pre-extracted backbone features (minutes), (2) export with `tensorflowjs_converter --quantize_float16`, (3) upload new ~330 KB head file, (4) update manifest. No existing heads are touched. A/B testing different head versions costs only ~330 KB of additional download per variant.

---

## Conclusion: data curation matters more than model complexity

The shared MobileNet-v2 backbone with independent MLP heads is architecturally sound and computationally efficient — training the entire system takes under 10 minutes on commodity hardware and deploys at 8.5 MB, half the budget. The real engineering challenges lie elsewhere.

**Three categories are data-ready today.** Violence (16,700+ still images from two complementary datasets), weapons (30,000+ classification images from OD-WeaponDetection with built-in confuser objects), and drugs/alcohol (13,000+ from ImageNet subclasses plus pill datasets) all exceed the 500-images-per-class threshold for reliable frozen-backbone transfer learning.

**Two categories require significant data engineering.** Hate symbols (~2,200 images across 6 classes) sits at the borderline viable threshold and demands synthetic augmentation via DreamBooth — plan for 2–3 weeks of data curation and generation. Self-harm has no ethically available direct dataset and requires a proxy approach through medical wound detection data, accepting reduced accuracy as an inherent limitation that the broader safety pipeline must compensate for.

**False-positive control, not raw accuracy, is the decisive factor.** The iterative hard-negative mining pipeline — running the classifier against actual ChatBridge game content, collecting false positives, and retraining — should begin immediately after initial model deployment. Combined with focal loss (γ=2, α=0.3), temperature-calibrated confidence thresholds at 0.9, and allowlisting of known game assets, this approach can compound false-positive rates below 0.5%. The classifier should be treated as a living system requiring monthly retraining cycles, not a one-time deployment.
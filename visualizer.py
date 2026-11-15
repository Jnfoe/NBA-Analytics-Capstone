"""
Visualizer
==========
Generates charts saved as PNG files in analytics/charts/.
Charts:
  1. Feature importance (model coefficients / tree importances)
  2. Model accuracy (Brier score and train accuracy)
"""

import os
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for server use
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

CHARTS_DIR = os.path.join(os.path.dirname(__file__), "charts")
os.makedirs(CHARTS_DIR, exist_ok=True)

DARK_BG = "#0d0d0d"
CARD_BG = "#181818"
PRIMARY = "#c0c0c0"   # light gray for positive values
SECONDARY = "#808080" # medium gray for contrast
GREEN = "#22c55e"     # keep green — communicates positive/winning
RED = "#ef4444"       # keep red — communicates negative/losing
TEXT = "#f5f5f5"
MUTED = "#6b7280"


def setup_dark_style():
    plt.rcParams.update({
        "figure.facecolor": DARK_BG,
        "axes.facecolor": CARD_BG,
        "axes.edgecolor": MUTED,
        "axes.labelcolor": TEXT,
        "xtick.color": TEXT,
        "ytick.color": TEXT,
        "text.color": TEXT,
        "grid.color": "#334155",
        "grid.alpha": 0.5,
        "font.family": "monospace",
        "font.size": 10,
    })


def chart_feature_importance(feature_importance: dict, model_name: str) -> str:
    """Horizontal bar chart of model feature importances or coefficients."""
    if not feature_importance:
        return ""

    setup_dark_style()
    fig, ax = plt.subplots(figsize=(8, 6))
    fig.patch.set_facecolor(DARK_BG)

    sorted_items = sorted(feature_importance.items(), key=lambda x: abs(x[1]))
    features = [item[0].replace("_", " ").title() for item in sorted_items]
    values = [item[1] for item in sorted_items]
    colors = [GREEN if v > 0 else RED for v in values]

    ax.barh(features, values, color=colors, alpha=0.85, edgecolor="#ffffff10")
    ax.axvline(0, color=MUTED, linewidth=1, linestyle="--")
    ax.set_xlabel("Importance" if model_name == "Random Forest" else "Coefficient", labelpad=10)
    ax.set_title(f"Feature Importance ({model_name})", fontsize=14, fontweight="bold", color=TEXT, pad=15)
    ax.grid(axis="x", alpha=0.3)

    plt.tight_layout()
    path = os.path.join(CHARTS_DIR, "feature_importance.png")
    plt.savefig(path, dpi=120, bbox_inches="tight")
    plt.close()
    return "/charts/feature_importance.png"


def chart_model_accuracy(metrics: dict) -> str:
    """Bar chart of cross-validated Brier scores and training accuracy."""
    setup_dark_style()
    fig, ax = plt.subplots(figsize=(7, 4))
    fig.patch.set_facecolor(DARK_BG)

    labels = ["LR CV Brier", "RF CV Brier", "Train Accuracy"]
    values = [
        metrics.get("lr_cv_brier", 0),
        metrics.get("rf_cv_brier", 0),
        metrics.get("train_accuracy", 0),
    ]
    colors = [PRIMARY, SECONDARY, GREEN]

    bars = ax.bar(labels, values, color=colors, alpha=0.85, edgecolor="#ffffff10", width=0.5)
    for bar, val in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01,
                f"{val:.3f}", ha="center", va="bottom", fontsize=10, color=TEXT)

    ax.set_ylabel("Score", labelpad=10)
    ax.set_title(f"Model Performance ({metrics.get('model_name', 'Unknown')} selected)",
                 fontsize=12, fontweight="bold", color=TEXT, pad=15)
    ax.set_ylim(0, max((v for v in values if v > 0), default=1) * 1.2)
    ax.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    path = os.path.join(CHARTS_DIR, "model_accuracy.png")
    plt.savefig(path, dpi=120, bbox_inches="tight")
    plt.close()
    return "/charts/model_accuracy.png"

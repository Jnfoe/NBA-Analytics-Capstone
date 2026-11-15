"""
ML Model
========
Trains and evaluates a win probability prediction model.

REWRITE NOTES
-------------
Major changes made in this version:
1. Added model persistence with joblib:
   - save_model(...)
   - load_model(...)
2. Added os.makedirs(...) so saving will not fail if /models does not exist.
3. Added DEFAULT_MODEL_PATH constant so the save/load path is centralized.
4. Added stronger docstrings and comments explaining what each section does.
5. Kept your original training logic mostly the same so behavior does not change.
6. Kept FEATURE_COLS exactly the same so your engine/prediction code will still work.
"""

import os                         # NEW: needed to create the models/ folder safely
import warnings
import joblib                     # NEW: used to save/load trained model objects

import numpy as np
import pandas as pd

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, brier_score_loss
from sklearn.pipeline import Pipeline

warnings.filterwarnings("ignore")

# -------------------------------------------------------------------
# FEATURE COLUMNS
# -------------------------------------------------------------------
# These are the exact columns your training and prediction data must have.
# I did NOT change these because changing them would break compatibility
# with the rest of your pipeline.
FEATURE_COLS = [
    "home_win_rate", "home_home_win_rate", "home_avg_diff",
    "home_recent_win_rate", "home_recent_diff", "home_elo",
    "away_win_rate", "away_away_win_rate", "away_avg_diff",
    "away_recent_win_rate", "away_recent_diff", "away_elo",
    "elo_diff", "win_rate_diff", "diff_diff", "recent_diff_diff",
]

# -------------------------------------------------------------------
# NEW: DEFAULT SAVE PATH
# -------------------------------------------------------------------
# Instead of hardcoding the model path in multiple places, we define it once.
DEFAULT_MODEL_PATH = "models/nba_model.pkl"


def train_model(train_df: pd.DataFrame):
    """
    Train both Logistic Regression and Random Forest models.
    Select the better one using cross-validated Brier score.

    Returns:
        best_pipeline       -> trained sklearn Pipeline
        feature_importance  -> dict of coefficients/importances
        metrics             -> dict of training/cv metrics
    """

    # ---------------------------------------------------------------
    # SAME LOGIC AS BEFORE:
    # If there is not enough data, return a fallback-friendly result.
    # ---------------------------------------------------------------
    if len(train_df) < 10:
        print("WARNING: Not enough training data (<10 games).")
        return None, {}, {}

    # ---------------------------------------------------------------
    # SAME LOGIC:
    # Build X and y from the training dataf,,,,rame.
    # fillna(0.5) means:
    # if a feature is missing, use 0.5 as a neutral fallback.
    # ---------------------------------------------------------------
    X = train_df[FEATURE_COLS].fillna(0.5).values
    y = train_df["home_win"].values

    # ---------------------------------------------------------------
    # MODEL OPTION 1: Logistic Regression
    #
    # Kept as a Pipeline so scaler + model are bundled together.
    # This is IMPORTANT because it means when we save the pipeline,
    # we are saving both the scaler and the classifier in one object.
    # ---------------------------------------------------------------
    lr_pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, C=1.0, random_state=42))
    ])

    # ---------------------------------------------------------------
    # MODEL OPTION 2: Random Forest
    #
    # NOTE:
    # Random Forest does not really require feature scaling,
    # but I left the scaler in place to preserve your original structure.
    # That keeps the behavior more consistent with your current system.
    # ---------------------------------------------------------------
    rf_pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(
            n_estimators=200,
            max_depth=5,
            min_samples_leaf=3,
            random_state=42
        ))
    ])

    # ---------------------------------------------------------------
    # CROSS-VALIDATION SETUP
    #
    # Brier score is used because your task is probability prediction,
    # not just picking a class label.
    #
    # Lower Brier score = better calibrated probabilities.
    # ---------------------------------------------------------------
    cv = StratifiedKFold(
        n_splits=min(5, len(train_df) // 2),
        shuffle=True,
        random_state=42
    )

    # ---------------------------------------------------------------
    # Evaluate both models using cross-validation.
    # sklearn returns NEGATIVE brier score, so we flip the sign.
    # ---------------------------------------------------------------
    lr_scores = cross_val_score(lr_pipeline, X, y, cv=cv, scoring="neg_brier_score")
    rf_scores = cross_val_score(rf_pipeline, X, y, cv=cv, scoring="neg_brier_score")

    lr_brier = -lr_scores.mean()
    rf_brier = -rf_scores.mean()

    # ---------------------------------------------------------------
    # Select the better-performing model.
    # ---------------------------------------------------------------
    if lr_brier <= rf_brier:
        best_pipeline = lr_pipeline
        best_name = "Logistic Regression"
        best_brier = lr_brier
    else:
        best_pipeline = rf_pipeline
        best_name = "Random Forest"
        best_brier = rf_brier

    # ---------------------------------------------------------------
    # Train the winning model on ALL available training data.
    #
    # Why?
    # After cross-validation tells us which model is better, we want
    # the final model to learn from the full dataset before saving/using.
    # ---------------------------------------------------------------
    best_pipeline.fit(X, y)

    # ---------------------------------------------------------------
    # Extract feature importance / coefficients
    #
    # CHANGE:
    # I simplified the earlier "feature_importance = None" setup.
    # We now always return a dict once the best model is trained.
    # ---------------------------------------------------------------
    clf = best_pipeline.named_steps["clf"]

    if best_name == "Random Forest":
        feature_importance = dict(zip(FEATURE_COLS, clf.feature_importances_.tolist()))
    else:
        feature_importance = dict(zip(FEATURE_COLS, clf.coef_[0].tolist()))

    # ---------------------------------------------------------------
    # Training-set diagnostics
    #
    # NOTE:
    # These are training metrics, not validation metrics, so they may
    # look better than real-world performance. Still useful for debugging.
    # ---------------------------------------------------------------
    y_pred = best_pipeline.predict(X)
    y_prob = best_pipeline.predict_proba(X)[:, 1]

    train_accuracy = accuracy_score(y, y_pred)
    train_brier = brier_score_loss(y, y_prob)

    metrics = {
        "model_name": best_name,
        "training_samples": len(train_df),
        "cv_brier_score": round(best_brier, 4),
        "lr_cv_brier": round(lr_brier, 4),
        "rf_cv_brier": round(rf_brier, 4),
        "train_accuracy": round(train_accuracy, 4),
        "train_brier": round(train_brier, 4),
    }

    print(
        f"Best model: {best_name} | "
        f"CV Brier: {best_brier:.4f} | "
        f"Train Acc: {train_accuracy:.4f}"
    )

    return best_pipeline, feature_importance, metrics


def predict(pipeline, pred_df: pd.DataFrame) -> np.ndarray:
    """
    Generate win probability predictions for upcoming games.

    If pipeline is None:
        fall back to Elo-based probability.
    """

    # ---------------------------------------------------------------
    # SAME LOGIC:
    # If no trained ML model is available, use Elo difference as a
    # backup probability estimator.
    # ---------------------------------------------------------------
    if pipeline is None:
        probs = []
        for _, row in pred_df.iterrows():
            elo_diff = row.get("elo_diff", 0)
            prob = 1 / (1 + 10 ** (-elo_diff / 400))
            probs.append(prob)
        return np.array(probs)

    # ---------------------------------------------------------------
    # SAME LOGIC:
    # Build the feature matrix using the exact feature columns used
    # during training, then return P(home team wins).
    # ---------------------------------------------------------------
    X = pred_df[FEATURE_COLS].fillna(0.5).values
    return pipeline.predict_proba(X)[:, 1]


# -------------------------------------------------------------------
# NEW: SAVE MODEL FUNCTION
# -------------------------------------------------------------------
# This is one of the main changes.
#
# Why save a DICTIONARY instead of only the pipeline?
# Because your engine also uses:
# - feature importance
# - metrics
# - feature column list
#
# Saving them all together keeps everything in one file.
# -------------------------------------------------------------------
def save_model(
    pipeline,
    feature_importance: dict,
    metrics: dict,
    path: str = DEFAULT_MODEL_PATH
):
    """
    Save trained model artifacts to disk.

    What gets saved:
    - pipeline
    - feature_importance
    - metrics
    - feature_cols
    """

    # ---------------------------------------------------------------
    # NEW:
    # Ensure the folder exists before trying to save.
    # Without this, joblib.dump(...) will fail if "models/" is missing.
    # ---------------------------------------------------------------
    os.makedirs(os.path.dirname(path), exist_ok=True)

    payload = {
        "pipeline": pipeline,
        "feature_importance": feature_importance,
        "metrics": metrics,
        "feature_cols": FEATURE_COLS,
    }

    joblib.dump(payload, path)
    print(f"Model saved to: {path}")


# -------------------------------------------------------------------
# NEW: LOAD MODEL FUNCTION
# -------------------------------------------------------------------
# This is the second main change.
#
# Use this in your engine when you want to predict WITHOUT retraining.
# -------------------------------------------------------------------
def load_model(path: str = DEFAULT_MODEL_PATH):
    """
    Load saved model artifacts from disk.

    Returns:
        pipeline
        feature_importance
        metrics
        feature_cols
    """

    saved = joblib.load(path)

    return (
        saved["pipeline"],
        saved.get("feature_importance", {}),
        saved.get("metrics", {}),
        saved.get("feature_cols", FEATURE_COLS),
    )
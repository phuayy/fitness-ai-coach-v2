from app.models import RepEvent, WorkoutSession


def build_advice(session: WorkoutSession, reps: list[RepEvent]) -> list[str]:
    if session.total_reps == 0:
        return ["No completed reps were saved for this session. Start with a short set and keep your full body inside the camera frame."]

    valid_ratio = session.valid_reps / session.total_reps if session.total_reps else 0
    advice: list[str] = []

    if valid_ratio >= 0.85:
        advice.append("Great consistency. Most reps were marked valid, so the next goal is controlled tempo and stable camera positioning.")
    elif valid_ratio >= 0.6:
        advice.append("Good start. A few reps were flagged, so slow down slightly and focus on repeating the same range of motion each rep.")
    else:
        advice.append("Prioritize form before speed. Use fewer reps per set and keep the whole body visible so the pose model has reliable landmarks.")

    low_confidence = [rep for rep in reps if rep.confidence < 0.55]
    if low_confidence:
        advice.append("Several reps had low tracking confidence. Improve lighting, move farther from the camera, and avoid cropping joints out of frame.")

    if session.exercise_type == "squat":
        advice.append("For squats, keep both feet visible and use a side or 45-degree camera angle so knee and hip movement are easier to detect.")
    elif session.exercise_type == "pushup":
        advice.append("For push-ups, a side camera angle usually works best because elbow depth and body-line checks are clearer.")

    if session.duration_seconds and session.duration_seconds < 20 and session.total_reps > 8:
        advice.append("Your rep rate looks fast. Consider slowing down to make feedback more reliable and reduce rushed movement.")

    return advice

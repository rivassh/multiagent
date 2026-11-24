# Answer namespace services - image processor and form processor
# These are additive services that can be run in parallel with other namespaces

# Answer image processor service
FROM python:3.11-slim as answer-image-processor

WORKDIR /app/answer

# Install required packages
RUN pip install --no-cache-dir pillow opencv-python

# Copy the processing script
COPY process_image.py /app/answer/process_image.py

# Set environment variables
ENV STATE_ANSWER_PATH=/app/answer
ENV PROJECT_ROOT=/app

# Run the image processing pipeline
CMD ["python3", "process_image.py"]

# Answer form processor service
FROM python:3.11-slim as answer-form-processor

WORKDIR /app/answer

# Install required packages
RUN pip install --no-cache-dir pillow

# Copy the form processing script
COPY process_form.py /app/answer/process_form.py

# Set environment variables
ENV STATE_ANSWER_PATH=/app/answer
ENV PROJECT_ROOT=/app

# Run the form processing pipeline
CMD ["python3", "process_form.py"]

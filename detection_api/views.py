from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from PIL import Image
import io
import base64
import numpy as np

# Импортируем новую функцию классификации
from .crack_classification_pipeline import classify_crack

@api_view(['POST'])
def detect_defects_endpoint(request):
    """
    Принимает картинку, использует Roboflow для классификации и возвращает результат
    """
    try:
        # Получаем картинку из запроса
        if 'image' not in request.FILES:
            return Response(
                {'error': 'No image provided'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        image_file = request.FILES['image']
        
        # Открываем и ресайзим картинку до 512x512
        image = Image.open(image_file)
        image = image.convert('RGB')
        resized_image = image.resize((512, 512), Image.LANCZOS)
        
        # Конвертируем в base64 для отправки обратно
        buffer = io.BytesIO()
        resized_image.save(buffer, format='JPEG', quality=95)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        # Конвертируем PIL в numpy для классификации
        image_array = np.array(resized_image)
        # PIL дает RGB, а OpenCV ожидает BGR
        image_bgr = image_array[:, :, ::-1]  # RGB -> BGR
        
        # Используем Roboflow для классификации
        try:
            classification_result = classify_crack(image_bgr)
            
            if not classification_result.get('success', False):
                return Response(
                    {'error': f'Classification failed: {classification_result.get("error", "Unknown error")}'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
        except Exception as e:
            return Response(
                {'error': f'Roboflow API error: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Формируем ответ в новом формате (без bbox, только классификация)
        response_data = {
            'success': True,
            'image_base64': f'data:image/jpeg;base64,{image_base64}',
            'image_size': {'width': 512, 'height': 512},
            'classification': classification_result.get('classification'),
            'confidence': classification_result.get('confidence', 0.0),
            'model_info': classification_result.get('model_info', {}),
            'analysis_type': 'classification'  # Указываем что это классификация, не детекция
        }
        
        return Response(response_data)
        
    except Exception as e:
        return Response(
            {'error': f'Error processing image: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def get_demo_images(request):
    """Возвращает список демо-изображений из staticfiles/demo"""
    from django.conf import settings
    import os
    
    demo_images = []
    demo_path = os.path.join(settings.STATIC_ROOT, 'demo')
    
    # Проверяем существует ли папка
    if not os.path.exists(demo_path):
        return Response({
            'demo_images': [],
            'error': 'Demo folder not found. Run collectstatic first.'
        })
    
    # Поддерживаемые форматы
    supported_formats = ['.jpg', '.jpeg', '.png', '.webp']
    
    try:
        # Читаем все файлы из папки demo
        for filename in os.listdir(demo_path):
            if any(filename.lower().endswith(ext) for ext in supported_formats):
                file_path = os.path.join(demo_path, filename)
                
                # Открываем и конвертируем в base64
                with open(file_path, 'rb') as img_file:
                    image = Image.open(img_file)
                    image = image.convert('RGB')
                    
                    # Конвертируем в base64
                    buffer = io.BytesIO()
                    image.save(buffer, format='JPEG', quality=95)
                    image_base64 = base64.b64encode(buffer.getvalue()).decode()
                    
                    # Добавляем в список
                    demo_images.append({
                        'name': os.path.splitext(filename)[0],  # Имя без расширения
                        'image_base64': f'data:image/jpeg;base64,{image_base64}'
                    })
        
        return Response({
            'demo_images': demo_images
        })
        
    except Exception as e:
        return Response({
            'demo_images': [],
            'error': f'Error reading demo images: {str(e)}'
        })


@api_view(['GET'])
def health_check(request):
    """Проверка здоровья API"""
    return Response({
        'status': 'healthy',
        'message': 'Crack Classification API with Roboflow is running',
        'api_type': 'classification'
    })


def home_view(request):
    """Главная страница с шаблоном"""
    from django.shortcuts import render
    return render(request, 'base.html')
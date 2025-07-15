from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from PIL import Image
import tempfile
import shutil
from pathlib import Path
import io
import base64

# Импортируем функцию детекции товарища
from .defect_detection_pipeline import detect_defects

@api_view(['POST'])
def detect_defects_endpoint(request):
    """
    Принимает картинку, использует реальную модель для детекции и возвращает результат
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
        
        # Сохраняем во временный файл для передачи в модель
        tmpdir = tempfile.mkdtemp()
        try:
            temp_image_path = Path(tmpdir) / "temp_image.jpg"
            resized_image.save(temp_image_path, format='JPEG', quality=95)
            
            # Используем реальную модель для детекции
            gemini_result = detect_defects([str(temp_image_path)], model="gemini-2.5-pro")
            
            # Конвертируем результат в наш формат
            detection_data = convert_gemini_to_our_format(gemini_result)
            
        except Exception as e:
            return Response(
                {'error': f'Detection model error: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        finally:
            # Очищаем временные файлы
            shutil.rmtree(tmpdir, ignore_errors=True)
        
        return Response({
            'success': True,
            'image_base64': f'data:image/jpeg;base64,{image_base64}',
            'detections': detection_data,
            'image_size': {'width': 512, 'height': 512}
        })
        
    except Exception as e:
        return Response(
            {'error': f'Error processing image: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def convert_gemini_to_our_format(gemini_result):
    """Конвертируем результат Gemini в формат нашего фронтенда"""
    
    # Маппинг категорий damage
    damage_categories = {
        0: {'id': 0, 'name': 'Hairline', 'type': 'crack'},
        1: {'id': 1, 'name': 'Fine', 'type': 'crack'},
        2: {'id': 2, 'name': 'Aesthetic (>1 <5mm)', 'type': 'crack'},
        3: {'id': 3, 'name': 'Serviceability (>5 <15mm)', 'type': 'crack'},
        4: {'id': 4, 'name': 'Serviceability (>15 <25mm)', 'type': 'crack'},
        5: {'id': 5, 'name': 'Stability (>25mm)', 'type': 'crack'},
    }
    
    # Маппинг типов moisture
    moisture_categories = {
        'RD': {'id': 'RD', 'name': 'Rising Damp', 'type': 'moisture'},
        'PD': {'id': 'PD', 'name': 'Penetrating Damp', 'type': 'moisture'},
        'C': {'id': 'C', 'name': 'Condensation', 'type': 'moisture'},
    }
    
    detections = []
    detection_id = 1
    
    # Обрабатываем damage (трещины)
    for damage in gemini_result.damage:
        # Конвертируем bbox из формата [y_min, x_min, y_max, x_max] (0-1000) в наш формат
        y_min, x_min, y_max, x_max = damage.bbox
        
        # Переводим из координат 0-1000 в координаты 0-512
        x1 = int(x_min * 512 / 1000)
        y1 = int(y_min * 512 / 1000)
        x2 = int(x_max * 512 / 1000)
        y2 = int(y_max * 512 / 1000)
        
        # Убеждаемся что координаты в пределах изображения
        x1 = max(0, min(x1, 512))
        y1 = max(0, min(y1, 512))
        x2 = max(0, min(x2, 512))
        y2 = max(0, min(y2, 512))
        
        category = damage_categories.get(damage.category, damage_categories[1])
        
        detection = {
            'id': detection_id,
            'type': 'crack',
            'category': category,
            'bbox': {
                'x1': x1,
                'y1': y1,
                'x2': x2,
                'y2': y2
            },
            'confidence': 0.95  # Фиксированный confidence для Gemini
        }
        
        detections.append(detection)
        detection_id += 1
    
    # Обрабатываем moisture (влагу)
    for moisture in gemini_result.moisture:
        # Конвертируем bbox
        y_min, x_min, y_max, x_max = moisture.bbox
        
        x1 = int(x_min * 512 / 1000)
        y1 = int(y_min * 512 / 1000)
        x2 = int(x_max * 512 / 1000)
        y2 = int(y_max * 512 / 1000)
        
        x1 = max(0, min(x1, 512))
        y1 = max(0, min(y1, 512))
        x2 = max(0, min(x2, 512))
        y2 = max(0, min(y2, 512))
        
        category = moisture_categories.get(moisture.moisture_type, moisture_categories['C'])
        
        detection = {
            'id': detection_id,
            'type': 'moisture',
            'category': category,
            'bbox': {
                'x1': x1,
                'y1': y1,
                'x2': x2,
                'y2': y2
            },
            'confidence': 0.95
        }
        
        detections.append(detection)
        detection_id += 1
    
    return detections


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
        'message': 'Defect Detection API with Gemini model is running'
    })


def home_view(request):
    """Главная страница с шаблоном"""
    from django.shortcuts import render
    return render(request, 'base.html')
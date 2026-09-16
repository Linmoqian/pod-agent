// macOS Quick Look 缩略图原生桥接，避免逐张启动 qlmanage 子进程。
// Created on 2026-09-16
// @author: https://github.com/Linmoqian

#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <QuickLookThumbnailing/QuickLookThumbnailing.h>

#include <dispatch/dispatch.h>
#include <stdlib.h>
#include <string.h>

static NSData *png_data_from_image(CGImageRef image) {
    if (image == NULL) {
        return nil;
    }
    CFMutableDataRef data = CFDataCreateMutable(kCFAllocatorDefault, 0);
    if (data == NULL) {
        return nil;
    }
    CGImageDestinationRef destination = CGImageDestinationCreateWithData(
        data,
        CFSTR("public.png"),
        1,
        NULL
    );
    if (destination == NULL) {
        CFRelease(data);
        return nil;
    }
    CGImageDestinationAddImage(destination, image, NULL);
    const BOOL finalized = CGImageDestinationFinalize(destination);
    CFRelease(destination);
    if (!finalized) {
        CFRelease(data);
        return nil;
    }
    NSData *result = [NSData dataWithBytes:CFDataGetBytePtr(data)
                                    length:(NSUInteger)CFDataGetLength(data)];
    CFRelease(data);
    return result;
}

int lian_quicklook_thumbnail(const char *path, unsigned char **bytes, size_t *length) {
    if (path == NULL || bytes == NULL || length == NULL) {
        return 0;
    }
    *bytes = NULL;
    *length = 0;
    @autoreleasepool {
        NSString *path_string = [NSString stringWithUTF8String:path];
        NSURL *url = [NSURL fileURLWithPath:path_string];
        if (url == nil) {
            return 0;
        }
        QLThumbnailGenerationRequest *request = [[QLThumbnailGenerationRequest alloc]
            initWithFileAtURL:url
            size:CGSizeMake(240.0, 180.0)
            scale:1.0
            representationTypes:QLThumbnailGenerationRequestRepresentationTypeThumbnail];
        dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
        __block NSData *png_data = nil;
        QLThumbnailGenerator *generator = [QLThumbnailGenerator sharedGenerator];
        [generator generateBestRepresentationForRequest:request
                                       completionHandler:^(QLThumbnailRepresentation *thumbnail, NSError *error) {
            (void)error;
            if (thumbnail != nil) {
                png_data = png_data_from_image(thumbnail.CGImage);
            }
            dispatch_semaphore_signal(semaphore);
        }];
        dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC);
        if (dispatch_semaphore_wait(semaphore, timeout) != 0) {
            [generator cancelRequest:request];
            return 0;
        }
        if (png_data == nil || png_data.length == 0) {
            return 0;
        }
        unsigned char *result = malloc(png_data.length);
        if (result == NULL) {
            return 0;
        }
        memcpy(result, png_data.bytes, png_data.length);
        *bytes = result;
        *length = png_data.length;
        return 1;
    }
}

void lian_quicklook_thumbnail_free(unsigned char *bytes) {
    free(bytes);
}

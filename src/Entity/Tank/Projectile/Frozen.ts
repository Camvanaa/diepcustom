import Bullet from "./Bullet";
import Barrel from "../Barrel";
import { BarrelBase } from "../TankBody";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { StyleFlags, Color, Stat } from "../../../Const/Enums";
import LivingEntity from "../../Live";
import { PhysicsFlags } from "../../../Const/Enums";
import { EntityStateFlags } from "../../../Native/Entity";

class FrozenEffect {
    private target!: LivingEntity;
    private endTick!: number;
    private slowRatio!: number;
    private game!: any;
    private source!: Frozen;
    private interval!: NodeJS.Timeout;
    private originalSpeed!: number;

    // 用于追踪每个目标的冰冻层数
    private static targetStacks = new Map<LivingEntity, number>();
    // 用于追踪每个子弹对目标的冰冻效果
    private static activeEffects = new Map<LivingEntity, Map<number, FrozenEffect>>();
    // 存储每个目标的原始速度
    private static originalSpeeds = new Map<LivingEntity, number>();

    constructor(target: LivingEntity, endTick: number, slowRatio: number, source: Frozen) {
        let targetEffects = FrozenEffect.activeEffects.get(target);
        if (targetEffects?.has(source.hash)) {
            return;
        }

        // 获取或设置原始速度
        let originalSpeed = FrozenEffect.originalSpeeds.get(target);
        if (!originalSpeed && (target as any).cameraEntity?.cameraData) {
            originalSpeed = ((target as any).cameraEntity.cameraData.values.movementSpeed as number) || 0;
            FrozenEffect.originalSpeeds.set(target, originalSpeed);
        }

        if (!targetEffects) {
            targetEffects = new Map();
            FrozenEffect.activeEffects.set(target, targetEffects);
            FrozenEffect.targetStacks.set(target, 0);
        }

        // 增加目标的减速层数
        const currentStacks = (FrozenEffect.targetStacks.get(target) || 0) + 1;
        FrozenEffect.targetStacks.set(target, currentStacks);
        
        targetEffects.set(source.hash, this);

        this.target = target;
        this.endTick = endTick;
        this.slowRatio = slowRatio;
        this.game = target.game;
        this.source = source;
        this.originalSpeed = originalSpeed || 0;
        
        if ((target as any).cameraEntity?.cameraData) {
            // 玩家减速
            this.originalSpeed = ((target as any).cameraEntity.cameraData.values.movementSpeed as number) || 0;
            
            // 使用层数计算减速效果
            const totalSlowRatio = Math.min(currentStacks * slowRatio, 0.9);
            (target as any).cameraEntity.cameraData.values.movementSpeed = 
                this.originalSpeed! * (1 - totalSlowRatio);
            
            //console.log(`应用减速效果 - 目标: ${target.hash}, 层数: ${currentStacks}, 减速比例: ${totalSlowRatio}`);
            //console.log(`原始速度: ${this.originalSpeed}, 减速后速度: ${(target as any).cameraEntity.cameraData.values.movementSpeed}`);
        } else if (target.velocity) {
            // 子弹减速
            if (!FrozenEffect.originalSpeeds.has(target)) {
                const speed = Math.hypot(target.velocity.x, target.velocity.y);
                FrozenEffect.originalSpeeds.set(target, speed);
            }
            this.originalSpeed = FrozenEffect.originalSpeeds.get(target)!;
            
            const totalSlowRatio = Math.min(currentStacks * slowRatio, 0.9);
            const currentSpeed = Math.hypot(target.velocity.x, target.velocity.y);
            if (currentSpeed > 0) {
                const scale = (this.originalSpeed * (1 - totalSlowRatio)) / currentSpeed;
                target.velocity.x *= scale;
                target.velocity.y *= scale;
            }
            
            //console.log(`应用子弹减速 - 目标: ${target.hash}, 层数: ${currentStacks}, 减速比例: ${totalSlowRatio}`);
        }

        this.interval = setInterval(() => {
            if (this.target.hash === 0 || this.game.tick >= this.endTick) {
                clearInterval(this.interval);
                if (this.target.hash !== 0 && (this.target as any).cameraEntity?.cameraData) {
                    const effects = FrozenEffect.activeEffects.get(this.target);
                    effects?.delete(this.source.hash);
                    
                    // 减少目标的减速层数
                    const currentStacks = (FrozenEffect.targetStacks.get(target) || 1) - 1;
                    //console.log(`效果结束 - 目标: ${target.hash}, 剩余层数: ${currentStacks}`);
                    
                    if (currentStacks > 0) {
                        FrozenEffect.targetStacks.set(target, currentStacks);
                        const totalSlowRatio = Math.min(currentStacks * this.slowRatio, 0.9);
                        (this.target as any).cameraEntity.cameraData.values.movementSpeed = 
                            this.originalSpeed * (1 - totalSlowRatio);
                        //console.log(`更新减速 - 目标: ${target.hash}, 新速度: ${(this.target as any).cameraEntity.cameraData.values.movementSpeed}`);
                    } else {
                        // 没有层数了，恢复原速并清理所有相关数据
                        (this.target as any).cameraEntity.cameraData.values.movementSpeed = this.originalSpeed;
                        FrozenEffect.activeEffects.delete(this.target);
                        FrozenEffect.targetStacks.delete(this.target);
                        FrozenEffect.originalSpeeds.delete(this.target);
                        //console.log(`完全恢复 - 目标: ${target.hash}, 恢复速度: ${this.originalSpeed}`);
                    }
                }
                return;
            }

            // 每个tick都重新应用减速效果
            if ((this.target as any).cameraEntity?.cameraData && this.target.hash !== 0) {
                const currentStacks = FrozenEffect.targetStacks.get(this.target) || 0;
                if (currentStacks > 0) {
                    const totalSlowRatio = Math.min(currentStacks * this.slowRatio, 0.9);
                    const currentSpeed = (this.target as any).cameraEntity.cameraData.values.movementSpeed;
                    
                    if (Math.abs(currentSpeed - (this.originalSpeed * (1 - totalSlowRatio))) > 0.001) {
                        //console.log(`Tick更新 - 目标: ${this.target.hash}, 层数: ${currentStacks}, 当前速度: ${currentSpeed}, 新速度: ${this.originalSpeed * (1 - totalSlowRatio)}`);
                        (this.target as any).cameraEntity.cameraData.values.movementSpeed = this.originalSpeed * (1 - totalSlowRatio);
                    }
                }
            } else if (this.target.velocity && this.target.hash !== 0) {
                const currentStacks = FrozenEffect.targetStacks.get(this.target) || 0;
                if (currentStacks > 0) {
                    const totalSlowRatio = Math.min(currentStacks * this.slowRatio, 0.9);
                    const currentSpeed = Math.hypot(this.target.velocity.x, this.target.velocity.y);
                    if (currentSpeed > 0) {
                        const targetSpeed = this.originalSpeed * (1 - totalSlowRatio);
                        const scale = targetSpeed / currentSpeed;
                        this.target.velocity.x *= scale;
                        this.target.velocity.y *= scale;
                    }
                }
            }
        }, 1000/60);
    }

    // 清理目标的所有效果
    public static clearTarget(target: LivingEntity) {
        const effects = FrozenEffect.activeEffects.get(target);
        if (effects) {
            for (const effect of effects.values()) {
                clearInterval(effect.interval);
            }
            if ((target as any).cameraEntity?.cameraData) {
                const originalSpeed = FrozenEffect.originalSpeeds.get(target);
                if (originalSpeed) {
                    (target as any).cameraEntity.cameraData.values.movementSpeed = originalSpeed;
                }
            }
            FrozenEffect.activeEffects.delete(target);
            FrozenEffect.targetStacks.delete(target);
            FrozenEffect.originalSpeeds.delete(target);
        }
    }
}

/**
 * 冰冻子弹类，可以减缓敌人移动速度
 */
export default class Frozen extends Bullet {
    /** 减速比例 */
    private slowRatio: number;
    
    /** 减速持续时间 */
    private slowDuration: number;

    public constructor(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number) {
        super(barrel, tank, tankDefinition, shootAngle);
        
        const bulletDamage = tank.cameraEntity.cameraData?.values.statLevels.values[Stat.BulletDamage] || 0;
        const bulletHealth = tank.cameraEntity.cameraData?.values.statLevels.values[Stat.BulletPenetration] || 0;
        
        this.slowRatio = (barrel.definition.bullet.slowRatio || 0.5) * (1 + bulletDamage * 0);
        this.slowDuration = (barrel.definition.bullet.slowDuration || 20) * (1 + bulletHealth * 0);
        
        // 设置冰冻子弹的颜色为浅蓝色
        this.styleData.values.color =  Color.Frozen;
        this.styleData.values.flags |= StyleFlags.hasNoDmgIndicator;
    }

    public tick(tick: number): void {
        super.tick(tick);

        const collidedEntity = this.physicsData.values.flags & PhysicsFlags.onlySameOwnerCollision ? null : this.findCollisions()[0];
        if (collidedEntity instanceof LivingEntity && collidedEntity.healthData) {
            new FrozenEffect(collidedEntity, this.game.tick + this.slowDuration, this.slowRatio, this);
            
        }
        
        if (tick - this.spawnTick >= this.lifeLength) this.destroy(true);
        // TODO(ABC):
        // This code will be reimplemented in the update that allows for easy camera entity switches
        if ((this.relationsData.values.team?.entityState || 0) & EntityStateFlags.needsDelete) this.relationsData.values.team = null
    }
} 